import { Deposit } from "../../domain/entities/Deposit";
import { VaultNotFoundError } from "../../domain/errors/DomainError";
import { IDepositRepository } from "../../domain/repositories/IDepositRepository";
import { IVaultProviderRepository } from "../../domain/repositories/IVaultProviderRepository";
import { CreateDepositDTO, DepositDTO } from "../dtos/DepositDTO";
import { DepositMapper } from "../mappers/DepositMapper";

/**
 * Use case for creating a new deposit.
 * Orchestrates the business logic for deposit creation.
 */
export class CreateDepositUseCase {
  constructor(
    private readonly depositRepository: IDepositRepository,
    private readonly vaultProviderRepository: IVaultProviderRepository,
  ) {}

  async execute(dto: CreateDepositDTO): Promise<DepositDTO> {
    // Validate and fetch vault providers
    const providers = await Promise.all(
      dto.providerIds.map(async (providerId) => {
        const provider =
          await this.vaultProviderRepository.findById(providerId);
        if (!provider) {
          throw new VaultNotFoundError(`Provider not found: ${providerId}`);
        }
        return provider;
      }),
    );

    // Generate a unique ID for the deposit
    const depositId = this.generateDepositId();

    // Create the deposit entity
    const deposit = Deposit.create({
      id: depositId,
      vaultId: dto.vaultId,
      depositorEthAddress: dto.depositorEthAddress,
      depositorBtcAddress: dto.depositorBtcAddress,
      amountSat: dto.amountSat,
      providers,
      btcTransactionId: dto.btcTransactionId,
      ethTransactionHash: dto.ethTransactionHash,
    });

    // Save to repository
    await this.depositRepository.save(deposit);

    // Return DTO
    return DepositMapper.toDTO(deposit);
  }

  private generateDepositId(): string {
    // Generate a unique ID (could use UUID or similar)
    return `dep_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
