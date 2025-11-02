import {
  DepositNotFoundError,
  InvalidDepositOperationError,
} from "../../domain/errors/DomainError";
import { IDepositRepository } from "../../domain/repositories/IDepositRepository";
import { RedeemDepositDTO } from "../dtos/DepositDTO";

/**
 * Use case for redeeming deposits.
 */
export class RedeemDepositUseCase {
  constructor(private readonly depositRepository: IDepositRepository) {}

  async execute(dto: RedeemDepositDTO): Promise<void> {
    // Validate all deposits exist and belong to the depositor
    const deposits = await Promise.all(
      dto.depositIds.map(async (depositId) => {
        const deposit = await this.depositRepository.findById(depositId);

        if (!deposit) {
          throw new DepositNotFoundError(depositId);
        }

        // Verify ownership
        if (deposit.getDepositorEthAddress() !== dto.depositorEthAddress) {
          throw new InvalidDepositOperationError(
            `Deposit ${depositId} does not belong to depositor ${dto.depositorEthAddress}`,
          );
        }

        // Check if deposit can be redeemed
        if (!deposit.canRedeem()) {
          throw new InvalidDepositOperationError(
            `Deposit ${depositId} cannot be redeemed in status ${deposit.getStatus().getState()}`,
          );
        }

        return deposit;
      }),
    );

    // Mark all deposits as redeemed
    await Promise.all(
      deposits.map(async (deposit) => {
        deposit.markAsRedeemed();
        await this.depositRepository.update(deposit);
      }),
    );
  }
}
