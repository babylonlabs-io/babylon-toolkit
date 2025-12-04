import type { ApplicationConfig, IApplicationAdapter } from "./types";

class AdapterRegistry {
  private adapters = new Map<string, IApplicationAdapter>();

  register(adapter: IApplicationAdapter): void {
    const id = adapter.id.toLowerCase();
    this.adapters.set(id, adapter);
  }

  unregister(applicationId: string): void {
    const id = applicationId.toLowerCase();
    this.adapters.delete(id);
  }

  get(applicationId: string): IApplicationAdapter | undefined {
    return this.adapters.get(applicationId.toLowerCase());
  }

  getOrThrow(applicationId: string): IApplicationAdapter {
    const adapter = this.get(applicationId);
    if (!adapter) {
      throw new Error(`No adapter registered for: ${applicationId}`);
    }
    return adapter;
  }

  getAll(): IApplicationAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAllConfigs(): ApplicationConfig[] {
    return this.getAll().map((a) => a.config);
  }

  has(applicationId: string): boolean {
    return this.adapters.has(applicationId.toLowerCase());
  }

  async initializeAll(): Promise<void> {
    await Promise.all(
      this.getAll().map(async (adapter) => {
        try {
          await adapter.initialize();
        } catch (error) {
          console.error(`Failed to initialize ${adapter.id}:`, error);
        }
      }),
    );
  }
}

export const adapterRegistry = new AdapterRegistry();

export const registerAdapter = (adapter: IApplicationAdapter) =>
  adapterRegistry.register(adapter);

export const unregisterAdapter = (applicationId: string) =>
  adapterRegistry.unregister(applicationId);

export const getAdapter = (applicationId: string) =>
  adapterRegistry.get(applicationId);

export const getAdapterOrThrow = (applicationId: string) =>
  adapterRegistry.getOrThrow(applicationId);

export const getAllAdapters = () => adapterRegistry.getAll();

export const getAllApplicationConfigs = () => adapterRegistry.getAllConfigs();

export const hasAdapter = (applicationId: string) =>
  adapterRegistry.has(applicationId);

export const initializeAllAdapters = () => adapterRegistry.initializeAll();
