import type {
  ChannelGatewayAdapter,
  ChannelGatewayAdapterV2,
  ChannelGatewayContext,
  ChannelGatewayContextV2,
} from "../channels/plugins/types.adapters.js";
import type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
import type { OpenClawPluginApi } from "./plugin-api.types.js";
import type {
  OpenClawPluginChannelRegistration,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  OpenClawPluginServiceContextV2,
  OpenClawPluginServiceV2,
} from "./plugin-registration.types.js";
import type { PluginServiceSchedulerV1 } from "./service-scheduler.types.js";

type Account = { accountId: string; token: string };
type Probe = { online: boolean };
type Audit = { count: number };

// Compile-only coverage for published V1 calls and inferred registration callbacks.
export async function verifyChannelRegistrationTypes(params: {
  api: Pick<OpenClawPluginApi, "registerChannel">;
  base: Pick<ChannelPlugin<Account>, "id" | "meta" | "capabilities" | "config">;
  legacyContext: Omit<ChannelGatewayContext<Account>, "scheduler">;
  contextV2: ChannelGatewayContextV2<Account>;
  registration: OpenClawPluginChannelRegistration | ChannelPlugin;
}) {
  const { api, base, legacyContext, contextV2 } = params;
  const pluginV1: ChannelPlugin<Account> = {
    ...base,
    gateway: {
      async startAccount(ctx) {
        const token: string = ctx.account.token;
        return token;
      },
    },
  };
  await pluginV1.gateway?.startAccount?.(legacyContext);
  const legacyRegistration: OpenClawPluginChannelRegistration = { plugin: pluginV1 };
  await legacyRegistration.plugin.gateway?.startAccount?.(legacyContext);
  const pluginV2: ChannelPlugin<Account, unknown, unknown, 2> = {
    ...base,
    gateway: {
      apiVersion: 2,
      async startAccount(ctx) {
        const owner: PluginServiceSchedulerV1 = ctx.scheduler;
        return owner.now();
      },
    },
  };
  await pluginV2.gateway?.startAccount?.(contextV2);
  // @ts-expect-error A V2 plugin cannot be manually started without its account scheduler.
  await pluginV2.gateway?.startAccount?.(legacyContext);
  const status: NonNullable<ChannelPlugin<Account, Probe, Audit>["status"]> = {
    probeAccount: async () => ({ online: true }),
    auditAccount: async ({ probe }) => ({ count: probe?.online ? 1 : 0 }),
    buildAccountSnapshot({ account, probe, audit }) {
      // @ts-expect-error The author's concrete Probe type must survive registration typing.
      probe?.missing;
      // @ts-expect-error The author's concrete Audit type must survive registration typing.
      audit?.missing;
      return {
        accountId: account.accountId,
        connected: probe?.online,
        lastError: audit?.count.toString(),
      };
    },
  };
  const probedV1: ChannelPlugin<Account, Probe, Audit> = { ...pluginV1, status };
  const probedV2: ChannelPlugin<Account, Probe, Audit, 2> = { ...pluginV2, status };
  const registrationV2: OpenClawPluginChannelRegistration<typeof probedV2> = { plugin: probedV2 };
  await registrationV2.plugin.gateway?.startAccount?.(contextV2);
  // @ts-expect-error The named V2 registration retains the required scheduler.
  await registrationV2.plugin.gateway?.startAccount?.(legacyContext);
  api.registerChannel(registrationV2);
  api.registerChannel(probedV1);
  api.registerChannel({ plugin: probedV2 });
  const legacy: ChannelGatewayAdapter = {
    async startAccount({ accountId, scheduler }) {
      return { accountId, now: scheduler?.now() };
    },
  };
  await legacy.startAccount?.(legacyContext);
  const current: ChannelGatewayAdapterV2 = {
    apiVersion: 2,
    async startAccount({ scheduler }) {
      return scheduler.now();
    },
  };
  await current.startAccount?.(contextV2);
  // @ts-expect-error V2 callers must provide the account's scheduling authority.
  await current.startAccount?.(legacyContext);
  api.registerChannel({ ...base, gateway: legacy });
  api.registerChannel({ plugin: { ...base, gateway: current } });
  api.registerChannel(params.registration);
  api.registerChannel({
    ...base,
    gateway: {
      async startAccount({ accountId, scheduler }) {
        return { accountId, now: scheduler?.now() };
      },
    },
  });
  api.registerChannel({
    plugin: {
      ...base,
      gateway: {
        async startAccount({ accountId, abortSignal, setStatus }) {
          setStatus({ accountId, running: !abortSignal.aborted });
        },
      },
    },
  });
  api.registerChannel({
    ...base,
    gateway: {
      apiVersion: 2,
      async startAccount({ scheduler }) {
        const owner: PluginServiceSchedulerV1 = scheduler;
        return owner.now();
      },
    },
  });
  api.registerChannel({
    plugin: {
      ...base,
      gateway: {
        apiVersion: 2,
        async startAccount({ scheduler }) {
          const owner: PluginServiceSchedulerV1 = scheduler;
          return owner.now();
        },
      },
    },
  });
}

export async function verifyServiceRegistrationTypes(params: {
  api: Pick<OpenClawPluginApi, "registerService">;
  legacyContext: Omit<OpenClawPluginServiceContext, "scheduler">;
  contextV2: OpenClawPluginServiceContextV2;
  service: OpenClawPluginService | OpenClawPluginServiceV2;
}) {
  const { api, legacyContext, contextV2 } = params;
  const legacy: OpenClawPluginService = {
    id: "legacy",
    start(ctx) {
      ctx.logger.info(ctx.stateDir);
    },
  };
  await legacy.start(legacyContext);
  const current: OpenClawPluginServiceV2 = {
    id: "current",
    apiVersion: 2,
    start(ctx) {
      const owner: PluginServiceSchedulerV1 = ctx.scheduler;
      owner.now();
    },
  };
  await current.start(contextV2);
  // @ts-expect-error V2 service callers must provide their scheduling authority.
  await current.start(legacyContext);
  api.registerService(params.service);
  api.registerService({
    id: "inline-legacy",
    start(ctx) {
      ctx.logger.info(ctx.stateDir);
      ctx.scheduler?.now();
    },
  });
  api.registerService({
    id: "inline-current",
    apiVersion: 2,
    start(ctx) {
      const owner: PluginServiceSchedulerV1 = ctx.scheduler;
      owner.now();
    },
  });
}
