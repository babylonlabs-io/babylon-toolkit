import { IDepositRepository } from "../../domain/repositories/IDepositRepository";
import {
  DepositDTO,
  DepositFilterDTO,
  PaginatedDepositsDTO,
} from "../dtos/DepositDTO";
import { DepositMapper } from "../mappers/DepositMapper";

/**
 * Use case for retrieving deposits with filtering and pagination.
 */
export class GetDepositsUseCase {
  constructor(private readonly depositRepository: IDepositRepository) {}

  /**
   * Get deposits for a specific depositor.
   */
  async getByDepositor(ethAddress: string): Promise<DepositDTO[]> {
    const deposits = await this.depositRepository.findByDepositor(ethAddress);
    return DepositMapper.toDTOList(deposits);
  }

  /**
   * Get a single deposit by ID.
   */
  async getById(depositId: string): Promise<DepositDTO | null> {
    const deposit = await this.depositRepository.findById(depositId);
    return deposit ? DepositMapper.toDTO(deposit) : null;
  }

  /**
   * Get deposits with filtering.
   */
  async getWithFilter(filter: DepositFilterDTO): Promise<PaginatedDepositsDTO> {
    // This is a simplified implementation
    // In a real scenario, the repository would handle pagination
    let deposits = [];

    if (filter.depositorAddress) {
      deposits = await this.depositRepository.findByDepositor(
        filter.depositorAddress,
      );
    } else if (filter.vaultId) {
      deposits = await this.depositRepository.findByVault(filter.vaultId);
    } else if (filter.status) {
      deposits = await this.depositRepository.findByStatus(filter.status);
    } else {
      // Get all deposits (would need to add this method to repository)
      deposits = await this.depositRepository.findByDepositor("");
    }

    // Apply date filtering if provided
    if (filter.fromDate || filter.toDate) {
      deposits = deposits.filter((deposit) => {
        const createdAt = deposit.getCreatedAt();
        if (filter.fromDate && createdAt < filter.fromDate) return false;
        if (filter.toDate && createdAt > filter.toDate) return false;
        return true;
      });
    }

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 20;
    const total = deposits.length;
    const paginatedDeposits = deposits.slice(offset, offset + limit);

    return {
      deposits: DepositMapper.toDTOList(paginatedDeposits),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get deposits pending confirmation.
   */
  async getPendingConfirmations(): Promise<DepositDTO[]> {
    const deposits = await this.depositRepository.findPendingConfirmations();
    return DepositMapper.toDTOList(deposits);
  }
}
