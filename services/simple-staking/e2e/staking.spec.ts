import { expect, test } from "@playwright/test";
import {
  btcstakingtx,
  btclightclientquery,
} from "@babylonlabs-io/babylon-proto-ts";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { DirectSecp256k1Wallet, makeSignBytes } from "@cosmjs/proto-signing";
import { crypto, payments, script, Transaction } from "bitcoinjs-lib";
import { BaseAccount } from "cosmjs-types/cosmos/auth/v1beta1/auth.js";
import { QueryAccountResponse } from "cosmjs-types/cosmos/auth/v1beta1/query.js";
import { SimulateResponse } from "cosmjs-types/cosmos/tx/v1beta1/service.js";
import { AuthInfo, TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { PubKey } from "cosmjs-types/cosmos/crypto/secp256k1/keys.js";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing.js";

import { STAKING_AMOUNT_BTC, STAKING_AMOUNT_SAT } from "./constants/staking";
import { WalletConnectActions } from "./fixtures/wallet_connect";
import { injectBBNQueries } from "./mocks/blockchain";
import mockData from "./mocks/blockchain/constants";

// Public test key 4. The funding output and chain responses exist only in this test.
const privateKeyHex = "4".padStart(64, "0");
const publicKey = Buffer.from(
  ecc.pointFromScalar(Buffer.from(privateKeyHex, "hex"))!,
);
const fundingOutput = payments.p2wpkh({ pubkey: publicKey }).output!;
const funding = new Transaction();
funding.addInput(Buffer.alloc(32), 0xffffffff);
funding.addOutput(fundingOutput, 200000);

test("create a V2 stake with local wallet signatures", async ({ page }) => {
  const data = structuredClone(mockData);
  data.bbnQueries.stakableBtc = String(funding.outs[0].value);
  data.bbnQueries.networkInfo.min_staking_value_sat = STAKING_AMOUNT_SAT;
  const [account] = await (
    await DirectSecp256k1Wallet.fromKey(
      Buffer.from(privateKeyHex, "hex"),
      "bbn",
    )
  ).getAccounts();
  let registration: btcstakingtx.MsgCreateBTCDelegation | undefined;
  let babylonTx = Buffer.alloc(0);
  let submittedBtc: Transaction | undefined;
  const unexpectedWrites: string[] = [];
  const toHex = (value: Uint8Array) => Buffer.from(value).toString("hex");
  const verifiedDelegation = () => ({
    finality_provider_btc_pks_hex: registration!.fpBtcPkList.map(toHex),
    params_version: 0,
    staker_btc_pk_hex: toHex(registration!.btcPk),
    state: "VERIFIED",
    delegation_staking: {
      staking_tx_hex: toHex(registration!.stakingTx),
      staking_tx_hash_hex: Transaction.fromBuffer(
        Buffer.from(registration!.stakingTx),
      ).getId(),
      staking_timelock: registration!.stakingTime,
      staking_amount: Number(registration!.stakingValue),
      start_height: 0,
      end_height: 0,
      bbn_inception_height: 1,
      bbn_inception_time: "2026-09-08T00:00:00Z",
      slashing: {
        slashing_tx_hex: toHex(registration!.slashingTx),
        spending_height: 0,
      },
    },
    delegation_unbonding: {
      unbonding_timelock: registration!.unbondingTime,
      unbonding_tx: toHex(registration!.unbondingTx),
      slashing: {
        unbonding_slashing_tx_hex: toHex(registration!.unbondingSlashingTx),
        spending_height: 0,
      },
    },
  });
  await injectBBNQueries(page, undefined, data);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (!["GET", "HEAD", "OPTIONS", "POST"].includes(method)) {
      unexpectedWrites.push(`${method} ${url.href}`);
      return route.abort();
    }
    if (
      url.pathname === "/babylon/costaking/v1/params" ||
      url.pathname.startsWith("/cosmos/staking/v1beta1/delegations/")
    )
      return route.abort();
    if (url.pathname.endsWith("/fees/recommended"))
      return route.fulfill({ json: data.btcWallet.networkFees });
    if (url.pathname.endsWith("/utxo"))
      return route.fulfill({
        json: [
          {
            txid: funding.getId(),
            vout: 0,
            value: funding.outs[0].value,
            status: { confirmed: true },
          },
        ],
      });
    if (url.pathname.includes("/validate-address/"))
      return route.fulfill({
        json: { isvalid: true, scriptPubKey: fundingOutput.toString("hex") },
      });
    if (url.pathname.endsWith(`/tx/${funding.getId()}/hex`))
      return route.fulfill({ body: funding.toHex() });
    if (url.pathname === "/v2/delegation")
      return route.fulfill({
        json: { data: registration ? verifiedDelegation() : null },
      });
    if (url.pathname === "/v2/delegations")
      return route.fulfill({
        json: {
          data: registration ? [verifiedDelegation()] : [],
          pagination: { next_key: "" },
        },
      });
    if (url.pathname.endsWith("/api/tx") && method === "POST") {
      submittedBtc = Transaction.fromHex(request.postData()!);
      expect(submittedBtc.ins).toHaveLength(1);
      const [witnessSignature, witnessPublicKey] = submittedBtc.ins[0].witness;
      expect(submittedBtc.ins[0].witness).toHaveLength(2);
      expect(witnessPublicKey).toEqual(publicKey);
      const { signature, hashType } = script.signature.decode(witnessSignature);
      expect(hashType).toBe(Transaction.SIGHASH_ALL);
      const hash = submittedBtc.hashForWitnessV0(
        0,
        payments.p2pkh({ pubkey: publicKey }).output!,
        funding.outs[0].value,
        hashType,
      );
      expect(ecc.verify(hash, publicKey, signature)).toBe(true);
      return route.fulfill({ body: submittedBtc.getId() });
    }
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      if (url.href.includes("broadcast_tx")) {
        unexpectedWrites.push(url.href);
        return route.abort();
      }
      return route.fallback();
    }
    let rpc;
    try {
      rpc = request.postDataJSON();
    } catch {
      unexpectedWrites.push(url.href);
      return route.abort();
    }
    let result;
    if (rpc.method === "abci_query") {
      const path = rpc.params.path;
      let bytes;
      if (path.endsWith("/Tip"))
        bytes = btclightclientquery.QueryTipResponse.encode(
          btclightclientquery.QueryTipResponse.fromPartial({
            header: { height: data.btcWallet.tipHeight },
          }),
        ).finish();
      if (path.endsWith("/Account"))
        bytes = QueryAccountResponse.encode({
          account: {
            typeUrl: "/cosmos.auth.v1beta1.BaseAccount",
            value: BaseAccount.encode(
              BaseAccount.fromPartial({ address: account.address }),
            ).finish(),
          },
        }).finish();
      if (path.endsWith("/Simulate"))
        bytes = SimulateResponse.encode(
          SimulateResponse.fromPartial({
            gasInfo: { gasUsed: 100000n, gasWanted: 100000n },
          }),
        ).finish();
      if (!bytes) return route.fallback();
      result = {
        response: {
          code: 0,
          value: Buffer.from(bytes).toString("base64"),
          height: "1",
        },
      };
    } else if (rpc.method === "broadcast_tx_sync") {
      babylonTx = Buffer.from(rpc.params.tx, "base64");
      const raw = TxRaw.decode(babylonTx);
      expect(raw.signatures).toHaveLength(1);
      const auth = AuthInfo.decode(raw.authInfoBytes);
      expect(auth.signerInfos).toHaveLength(1);
      const signer = auth.signerInfos[0];
      expect(signer.sequence).toBe(0n);
      expect(signer.modeInfo?.single?.mode).toBe(SignMode.SIGN_MODE_DIRECT);
      expect(signer.publicKey?.typeUrl).toBe("/cosmos.crypto.secp256k1.PubKey");
      expect(PubKey.decode(signer.publicKey!.value).key).toEqual(
        account.pubkey,
      );
      const signBytes = makeSignBytes({
        bodyBytes: raw.bodyBytes,
        authInfoBytes: raw.authInfoBytes,
        chainId: "bbn-test",
        accountNumber: 0n,
      });
      expect(
        ecc.verify(
          crypto.sha256(Buffer.from(signBytes)),
          account.pubkey,
          raw.signatures[0],
        ),
      ).toBe(true);
      const body = TxBody.decode(raw.bodyBytes);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].typeUrl).toBe(
        "/babylon.btcstaking.v1.MsgCreateBTCDelegation",
      );
      registration = btcstakingtx.MsgCreateBTCDelegation.decode(
        body.messages[0].value,
      );
      expect(registration.stakerAddr).toBe(account.address);
      result = {
        code: 0,
        hash: crypto.sha256(babylonTx).toString("hex").toUpperCase(),
      };
    } else if (rpc.method === "tx_search") {
      result = {
        total_count: "1",
        txs: [
          {
            hash: crypto.sha256(babylonTx).toString("hex").toUpperCase(),
            height: "1",
            index: 0,
            tx: babylonTx.toString("base64"),
            tx_result: {
              code: 0,
              gas_wanted: "100000",
              gas_used: "100000",
              events: [],
            },
          },
        ],
      };
    } else if (rpc.method === "status") return route.fallback();
    else {
      unexpectedWrites.push(`${url.href} ${rpc.method}`);
      return route.abort();
    }
    return route.fulfill({ json: { jsonrpc: "2.0", id: rpc.id, result } });
  });
  await page.goto("/");
  await new WalletConnectActions(page).setupWalletConnection({
    data,
    privateKeyHex,
  });
  await page
    .getByText("Add Finality Provider", { exact: true })
    .first()
    .locator("..")
    .locator("svg")
    .click();
  await page.getByRole("row").filter({ hasText: "PRO Delegators" }).click();
  await page.getByPlaceholder("Enter Amount").fill(String(STAKING_AMOUNT_BTC));
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page
    .getByRole("button", { name: "Proceed to Signing", exact: true })
    .click();
  await page.getByRole("button", { name: "Stake BTC", exact: true }).click();
  await expect
    .poll(() => submittedBtc?.getId())
    .toBe(Transaction.fromBuffer(Buffer.from(registration!.stakingTx)).getId());
  expect(submittedBtc!.ins[0].hash).toEqual(funding.getHash());
  expect(submittedBtc!.ins[0].index).toBe(0);
  expect(submittedBtc!.outs[0].value).toBe(STAKING_AMOUNT_SAT);
  expect(registration!.stakingValue.toString()).toBe(
    String(STAKING_AMOUNT_SAT),
  );
  const key = `bbn-staking-delegations-v2-${publicKey.subarray(1).toString("hex")}_statuses`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
        key,
      ),
    )
    .toEqual({
      [submittedBtc!.getId()]: "INTERMEDIATE_PENDING_BTC_CONFIRMATION",
    });
  expect(unexpectedWrites).toEqual([]);
});
