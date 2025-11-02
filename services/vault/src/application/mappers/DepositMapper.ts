import { Deposit } from "../../domain/entities/Deposit";
import { BtcAmount } from "../../domain/value-objects/BtcAmount";
import { DepositStatus } from "../../domain/value-objects/DepositStatus";
import { VaultProvider } from "../../domain/value-objects/VaultProvider";
import { DepositDTO, VaultProviderDTO } from "../dtos/DepositDTO";

/**
 * Mapper for converting between Deposit entities and DTOs.
 */
export class DepositMapper {
  /**
   * Convert a Deposit entity to a DTO.
   */
  static toDTO(deposit: Deposit): DepositDTO {
    const status = deposit.getStatus();
    const amount = deposit.getAmount();

    return {
      id: deposit.getId(),
      vaultId: deposit.getVaultId(),
      depositorEthAddress: deposit.getDepositorEthAddress(),
      depositorBtcAddress: deposit.getDepositorBtcAddress(),
      amountSat: amount.value,
      amountBtc: amount.toBtc(),
      providers: deposit.getProviders().map(this.providerToDTO),
      status: status.getState(),
      confirmations: status.getConfirmations(),
      requiredConfirmations: status.getRequiredConfirmations(),
      canRedeem: deposit.canRedeem(),
      btcTransactionId: deposit.getBtcTransactionId(),
      ethTransactionHash: deposit.getEthTransactionHash(),
      createdAt: deposit.getCreatedAt().toISOString(),
      updatedAt: deposit.getUpdatedAt().toISOString(),
    };
  }

  /**
   * Convert multiple Deposit entities to DTOs.
   */
  static toDTOList(deposits: Deposit[]): DepositDTO[] {
    return deposits.map((deposit) => this.toDTO(deposit));
  }

  /**
   * Convert a VaultProvider to a DTO.
   */
  static providerToDTO(provider: VaultProvider): VaultProviderDTO {
    return {
      id: provider.getId(),
      btcPublicKey: provider.getBtcPublicKey(),
      name: provider.getName(),
      description: provider.getDescription(),
    };
  }

  /**
   * Convert a DTO to a VaultProvider value object.
   */
  static dtoToProvider(dto: VaultProviderDTO): VaultProvider {
    return new VaultProvider(
      dto.id,
      dto.btcPublicKey,
      dto.name,
      dto.description,
    );
  }

  /**
   * Create a Deposit entity from raw data (typically from database or API).
   */
  static toDomain(data: {
    id: string;
    vaultId: string;
    depositorEthAddress: string;
    depositorBtcAddress: string;
    amountSat: bigint;
    providers: VaultProviderDTO[];
    status: string;
    confirmations: number;
    requiredConfirmations: number;
    btcTransactionId?: string;
    ethTransactionHash?: string;
    createdAt: Date;
    updatedAt: Date;
  }): Deposit {
    const providers = data.providers.map((p) => this.dtoToProvider(p));
    const amount = new BtcAmount(data.amountSat);

    // Create status based on state and confirmations
    let status: DepositStatus;
    switch (data.status) {
      case "PENDING":
        status = DepositStatus.pending();
        break;
      case "CONFIRMING":
        status = DepositStatus.confirming(
          data.confirmations,
          data.requiredConfirmations,
        );
        break;
      case "CONFIRMED":
        status = DepositStatus.confirmed();
        break;
      case "REDEEMED":
        status = DepositStatus.redeemed();
        break;
      case "FAILED":
        status = DepositStatus.failed();
        break;
      default:
        status = DepositStatus.pending();
    }

    return new Deposit(
      data.id,
      data.vaultId,
      data.depositorEthAddress,
      data.depositorBtcAddress,
      amount,
      providers,
      status,
      data.btcTransactionId,
      data.ethTransactionHash,
      data.createdAt,
      data.updatedAt,
    );
  }
}
