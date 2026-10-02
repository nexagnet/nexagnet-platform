import { type ModuleMetadata, type Provider, type Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { CapabilityId } from '@netviet/tenant';
import { randomUUID } from 'node:crypto';
import { AgentEventsService } from './agents/agent-events.service.js';
import { AgentOrchestrator } from './agents/agent-orchestrator.service.js';
import { ApiKeyGuard } from './auth/api-key.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { InternalServiceGuard } from './auth/internal-service.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { SessionAuthGuard } from './auth/session-auth.guard.js';
import { AuditLogService } from './audit/audit-log.service.js';
import { BroadcastController } from './broadcast/broadcast.controller.js';
import { BroadcastService } from './broadcast/broadcast.service.js';
import { CampaignController } from './campaigns/campaign.controller.js';
import { CampaignRepository, InMemoryCampaignRepository } from './campaigns/campaign.repository.js';
import { CampaignScheduler } from './campaigns/campaign.scheduler.js';
import { CampaignService } from './campaigns/campaign.service.js';
import { CAMPAIGN_POLICY } from './campaigns/campaign.tokens.js';
import { PrismaCampaignRepository } from './campaigns/prisma-campaign.repository.js';
import { BotIdentityService } from './channels/bot-identity.service.js';
import { channelProvider, namedChannelProviders } from './channels/channel.provider.js';
import { OutboundChannelRouter } from './channels/outbound-channel.router.js';
import { ZaloController } from './channels/zalo.controller.js';
import { ChannelHealthService } from './channels/channel-health.js';
import { ZaloUserClient } from './channels/zalo-user.client.js';
import { PrismaModule } from './config/prisma.module.js';
import { PrismaService } from './config/prisma.service.js';
import { loadFoundationEnv } from './config/foundation-env.js';
import { FilesController } from './files/files.controller.js';
import { FilesModule } from './files/files.module.js';
import { DebugModule } from './debug/debug.module.js';
import { DecisionLedgerModule } from './decision-ledger/decision-ledger.module.js';
import { ContentModule } from './content/content.module.js';
import {
  ConversationThreadsRepository,
  InMemoryConversationThreadsRepository,
} from './conversations/conversation-threads.repository.js';
import { ConversationsService } from './conversations/conversations.service.js';
import { PrismaConversationThreadsRepository } from './conversations/prisma-conversation-threads.repository.js';
import { DemoController } from './demo/demo.controller.js';
import { ErpController } from './erp/erp.controller.js';
import { erpProvider } from './erp/erp.provider.js';
import { GroupIdentityService } from './groups/group-identity.service.js';
import { GroupParticipantsModule } from './groups/group-participants.module.js';
import { HealthController } from './health/health.controller.js';
import { BotPoller } from './ingest/bot-poller.js';
import { ZcaListener } from './ingest/zca-listener.js';
import { KnowledgeController } from './knowledge/knowledge.controller.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import {
  catalogStoreProvider,
  mediaFetcherProvider,
  mediaStoreProvider,
} from './media/media.provider.js';
import { CatalogMediaController } from './media/catalog-media.controller.js';
import { MediaHealthController } from './media/media-health.controller.js';
import { ConversationContextBuilder } from './messages/conversation-context.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { InMemoryMessagesRepository, MessagesRepository } from './messages/messages.repository.js';
import { OutboundRecorder } from './messages/outbound-recorder.js';
import { PrismaMessagesRepository } from './messages/prisma-messages.repository.js';
import { EmailLeadDispatcher } from './notifications/email-lead-dispatcher.js';
import { LeadDispatchService } from './notifications/lead-dispatch.service.js';
import { NotificationSettingsRepository } from './notifications/notification-settings.repository.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { SettingsNotificationsController } from './notifications/settings-notifications.controller.js';
import { ZaloLeadDispatcher } from './notifications/zalo-lead-dispatcher.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersRepository } from './orders/orders.repository.js';
import {
  InMemoryTurnRecordsRepository,
  TurnRecordsRepository,
} from './turns/turn-records.repository.js';
import { TurnReplyService } from './turns/turn-reply.service.js';
import { EvidenceRegistry } from './outbound/evidence-registry.port.js';
import { ContentService } from './content/content.service.js';
import { MessagesController } from './turns/turns.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { SalesOrderOutcomeService } from './orders/sales-order-outcome.service.js';
import { SalesHandoffController } from './orders/sales-handoff.controller.js';
import { SalesHandoffFollowupService } from './orders/sales-handoff-followup.service.js';
import { TurnOutcomePort } from './turns/turn-outcome.port.js';
import { OrderAmendmentService } from './orders/order-amendment.service.js';
import { OrderCommandAdapter } from './orders/order-command.adapter.js';
import { ORDER_COMMANDS } from './advisor/order-commands.token.js';
import { PrismaOrdersRepository } from './orders/prisma-orders.repository.js';
import { parserProvider } from './pipeline/parser.provider.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { ReadinessController } from './readiness/readiness.controller.js';
import { ReadinessService } from './readiness/readiness.service.js';
import { RuntimeSettingsService } from './runtime/runtime-settings.service.js';
import { GroupMappingService } from './settings/group-mapping.service.js';
import { MasterDataController } from './settings/master-data.controller.js';
import { MasterDataService } from './settings/master-data.service.js';
import { OperationalSettingsModule } from './settings/operational-settings.module.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsQueryService } from './settings/settings-query.service.js';
import { SourceTruthWriteService } from './settings/source-truth-write.service.js';
import { SourceRegistryModule } from './source-registry/source-registry.module.js';
import { StreamController } from './stream/stream.controller.js';
import { DriverFundController } from './transport/costing/driver-fund.controller.js';
import { DriverExpensesSelfController } from './transport/costing/driver-expenses-self.controller.js';
import { DriverFundSelfController } from './transport/costing/driver-fund-self.controller.js';
import { TransportCostingModule } from './transport/costing/transport-costing.module.js';
import { DriverExpenseEvidenceController } from './transport/evidence/driver-expense-evidence.controller.js';
import { DriverFuelEvidenceController } from './transport/evidence/driver-fuel-evidence.controller.js';
import {
  transportEvidenceMaxBytesProvider,
  transportEvidenceServiceProvider,
  transportEvidenceStoreProvider,
} from './transport/evidence/evidence.provider.js';
import { FuelEvidenceController } from './transport/evidence/fuel-evidence.controller.js';
import { DriverFuelController } from './transport/fuel/driver-fuel.controller.js';
import { FuelConsumptionController } from './transport/fuel/fuel-consumption.controller.js';
import { FuelCostAttributionController } from './transport/fuel/fuel-cost-attribution.controller.js';
import { FuelEntriesController } from './transport/fuel/fuel-entries.controller.js';
import { FuelReconciliationController } from './transport/fuel/fuel-reconciliation.controller.js';
import { FuelDocumentController } from './transport/fuel/fuel-document.controller.js';
import { FuelStationController } from './transport/fuel/fuel-station.controller.js';
import { TransportFuelModule } from './transport/fuel/transport-fuel.module.js';
import { TransportFuelAnalyticsBridgeModule } from './transport/fuel/fuel-analytics-bridge.module.js';
import { TollController } from './transport/toll/toll.controller.js';
import { TransportTollModule } from './transport/toll/transport-toll.module.js';
import { SettlementReportsController } from './transport/settlement/settlement-reports.controller.js';
import { TransportSettlementModule } from './transport/settlement/transport-settlement.module.js';
import { CustomerArController } from './transport/customer-ar/customer-ar.controller.js';
import { CustomerArModule } from './transport/customer-ar/customer-ar.module.js';
import { TransportAssetComplianceModule } from './transport/asset-compliance/transport-asset-compliance.module.js';
import { TransportWorkforceModule } from './transport/workforce/transport-workforce.module.js';
import { TransportDriverSettlementModule } from './transport/driver-settlement/transport-driver-settlement.module.js';
import { TransportAnalyticsModule } from './transport/analytics/transport-analytics.module.js';
import { TransportAnalyticsController } from './transport/analytics/analytics.controller.js';
import { DriverSettlementController } from './transport/driver-settlement/driver-settlement.controller.js';
import { DriverSettlementSelfController } from './transport/driver-settlement/driver-settlement-self.controller.js';
import { TransportProofModule } from './transport/proof/transport-proof.module.js';
import { DriverTrackingController } from './transport/proof/driver-tracking.controller.js';
import { TelematicsIngressController } from './transport/proof/telematics/telematics-ingress.controller.js';
import { TrackingController } from './transport/proof/tracking.controller.js';
import { DriverProofController } from './transport/proof/driver-proof.controller.js';
import { TransportCheckpointModule } from './transport/checkpoint/transport-checkpoint.module.js';
import { TransportDocumentEvidenceBridgeModule } from './transport/document/document-evidence-bridge.module.js';
import { TransportFieldModule } from './transport/field/transport-field.module.js';
import { DriverFieldController } from './transport/field/driver-field.controller.js';
import { ControlTowerFieldFactsAdapter } from './transport/field/control-tower-field.adapter.js';
import { ControlTowerFieldFacts } from './transport/control-tower/control-tower-facts.port.js';
import { TransportDocumentModule } from './transport/document/transport-document.module.js';
import { DriverDocumentsController } from './transport/document/driver-documents.controller.js';
import { DocumentsController } from './transport/document/documents.controller.js';
import { WaitingAllowanceController } from './transport/waiting/allowance.controller.js';
import { DriverWaitingController } from './transport/waiting/driver-waiting.controller.js';
import { TransportWaitingPayrollBridgeModule } from './transport/waiting/waiting-payroll-bridge.module.js';
import { WaitingController } from './transport/waiting/waiting.controller.js';
import { TransportSiteIntakeModule } from './transport/site-intake/transport-site-intake.module.js';
import { DriverSiteIntakeController } from './transport/site-intake/driver-site-intake.controller.js';
import { TransportAcceptanceModule } from './transport/acceptance/transport-acceptance.module.js';
import { CommercialAcceptanceController } from './transport/acceptance/commercial-acceptance.controller.js';
import { CheckpointsController } from './transport/checkpoint/checkpoints.controller.js';
import { DriverCheckpointsController } from './transport/checkpoint/driver-checkpoints.controller.js';
import { ProofReviewController } from './transport/proof/proof-review.controller.js';
import { OperationalAlertsService } from './transport/asset-compliance/operational-alerts.service.js';
import {
  AlertDriverFundSource,
  AlertFuelConsumptionSource,
  CostingFundAlertAdapter,
  FuelReviewAlertAdapter,
} from './transport/asset-compliance/alert-sources.js';
import { MaintenanceController } from './transport/asset-compliance/maintenance.controller.js';
import { ComplianceController } from './transport/asset-compliance/compliance.controller.js';
import { FleetStatusController } from './transport/asset-compliance/fleet-status.controller.js';
import { OperationalAlertsController } from './transport/asset-compliance/operational-alerts.controller.js';
import { PayrollController } from './transport/workforce/payroll.controller.js';
import { DriverPayslipsController } from './transport/workforce/driver-payslips.controller.js';
import { TripExpensesController } from './transport/costing/trip-expenses.controller.js';
import { AssetOwnershipController } from './transport/asset-ownership/asset-ownership.controller.js';
import { StakeholderVehiclesController } from './transport/asset-ownership/stakeholder-vehicles.controller.js';
import { StakeholderActivityService } from './transport/asset-ownership/stakeholder-activity.service.js';
import {
  StakeholderMaintenanceFacts,
  StakeholderMaintenanceFactsAdapter,
} from './transport/asset-ownership/stakeholder-activity-facts.port.js';
import { CounterpartyController } from './transport/counterparty/counterparty.controller.js';
import { CounterpartySitesController } from './transport/counterparty/counterparty-sites.controller.js';
import { TransportOrdersController } from './transport/movement/orders.controller.js';
import { DriverExpenseClaimsController } from './transport/claims/driver-claims-self.controller.js';
import { ExpenseClaimsController } from './transport/claims/claims.controller.js';
import { RunsController } from './transport/movement/runs.controller.js';
import { TransportPlanningController } from './transport/planning/planning.controller.js';
import { RunClosureSweepScheduler } from './transport/planning/run-closure-sweep.scheduler.js';
import { RunClosureService } from './transport/planning/run-closure.service.js';
import {
  NoRunClosureBlockerSource,
  RunClosureBlockerSource,
} from './transport/planning/run-closure-blocker.source.js';
import { CheckpointLegFieldTruthSource } from './transport/checkpoint/checkpoint-leg-field-truth.source.js';
import { CheckpointRunClosureBlockerSource } from './transport/checkpoint/checkpoint-run-closure-blocker.source.js';
import {
  LegFieldTruthSource,
  NoLegFieldTruthSource,
} from './transport/movement/leg-field-truth.port.js';
import { TransportCheckpointRunClosureBlockerSource } from './transport/checkpoint/transport-checkpoint-blocker.source.js';
import { WaitingRunClosureBlockerSource } from './transport/waiting/waiting-run-closure-blocker.source.js';
import { FleetController } from './transport/fleet/fleet.controller.js';
import { ControlTowerController } from './transport/control-tower/control-tower.controller.js';
import { JourneyController } from './transport/journey/journey.controller.js';
import { InsightController } from './transport/insight/insight.controller.js';
import { InsightReadService } from './transport/insight/insight-read.service.js';
import {
  InsightCoreFacts,
  InsightCoreFactsAdapter,
} from './transport/insight/insight-facts.port.js';
import { JourneyReadService } from './transport/journey/journey-read.service.js';
import {
  JourneyCheckpointFacts,
  JourneyCheckpointFactsAdapter,
  JourneyCoreFacts,
  JourneyCoreFactsAdapter,
  JourneyFuelFacts,
  JourneyFuelFactsAdapter,
  JourneyLocationFacts,
  JourneyLocationFactsAdapter,
} from './transport/journey/journey-facts.port.js';
import { FinanceController } from './transport/finance/finance.controller.js';
import { FinanceReadService } from './transport/finance/finance-read.service.js';
import {
  FinanceDriverBalanceFacts,
  FinanceDriverBalanceFactsAdapter,
  FinanceSettlementFacts,
  FinanceSettlementFactsAdapter,
} from './transport/finance/finance-facts.port.js';
import {
  FinanceRunFirstFacts,
  FinanceRunFirstFactsAdapter,
} from './transport/finance/finance-run-first.port.js';
import { ControlTowerReadService } from './transport/control-tower/control-tower-read.service.js';
import {
  ControlTowerAlertFacts,
  ControlTowerAlertFactsAdapter,
  ControlTowerCheckpointFacts,
  ControlTowerCheckpointFactsAdapter,
  ControlTowerClaimFacts,
  ControlTowerClaimFactsAdapter,
  ControlTowerCoreFacts,
  ControlTowerCoreFactsAdapter,
  ControlTowerFuelFacts,
  ControlTowerFuelFactsAdapter,
} from './transport/control-tower/control-tower-facts.port.js';
import {
  DispatchComplianceFacts,
  DispatchComplianceFactsAdapter,
  DispatchCoreFacts,
  DispatchCoreFactsAdapter,
  DispatchLocationFacts,
  DispatchLocationFactsAdapter,
} from './transport/dispatch/dispatch-facts.port.js';
import {
  DispatchAssignmentPlanner,
  PlanningDispatchAssignmentPlanner,
} from './transport/dispatch/dispatch-planner.port.js';
import {
  DEFAULT_TRANSPORT_DISPATCH_POLICY,
  TRANSPORT_DISPATCH_POLICY,
} from './transport/dispatch/dispatch-policy.js';
import { DispatchController } from './transport/dispatch/dispatch.controller.js';
import { DispatchService } from './transport/dispatch/dispatch.service.js';
import { createRoutingPort } from './transport/dispatch/routing/routing-provider.factory.js';
import { TransportRoutingPort } from './transport/dispatch/routing/transport-routing.port.js';
import { KnownPlacesFacts, KnownPlacesFactsAdapter } from './transport/places/known-places.port.js';
import { TransportPlaceService } from './transport/places/place.service.js';
import { createPlaceSearchPort } from './transport/places/place-search-provider.factory.js';
import { TransportPlaceSearchPort } from './transport/places/place-search.port.js';
import { TransportPlacesController } from './transport/places/places.controller.js';
import { PlaceAdminController } from './transport/places/admin/place-admin.controller.js';
import { TransportModule } from './transport/transport.module.js';
import { DriverTripsController } from './transport/trips/driver-trips.controller.js';
import { TripsController } from './transport/trips/trips.controller.js';
import { WorkflowModule } from './workflow/workflow.module.js';
import { tenantCampaignConfig } from '@netviet/tenant';

type CapabilityOwner = CapabilityId | 'foundation';
interface Owned<T> {
  readonly owner: CapabilityOwner;
  readonly value: T;
}

const owned = <T>(owner: CapabilityOwner, value: T): Owned<T> => ({ owner, value });

const IMPORTS: readonly Owned<NonNullable<ModuleMetadata['imports']>[number]>[] = [
  // `foundation`, KHONG phai mot capability: moi khach deu phai quan sat duoc (muc 12).
  // Cai khac nhau giua cac khach la muc chi tiet noi dung, khong phai co trace hay khong.
  owned('foundation', ObservabilityModule),
  owned('foundation', PrismaModule),
  owned('knowledge', KnowledgeModule),
  owned('foundation', AuthModule),
  owned('operations', OperationalSettingsModule),
  owned('messaging', GroupParticipantsModule),
  owned('knowledge', ContentModule),
  owned('foundation', ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])),
  // `foundation`, cung ly do voi ObservabilityModule: ban giao ben vung la nang luc ma BAT KY
  // mien nao cung co the can. Khach khong khai bao `integrations.workflowEngine` van nap module
  // nay va nhan cong VO HIEU HOA — boot binh thuong, dispatcher khong khoi dong.
  owned('foundation', WorkflowModule),
  // `foundation`: mot khach khong chan doan duoc la mot khach khong ho tro duoc. Module nay chi
  // DOC (vong dem trace + bang outbox) va khong phu thuoc capability nao — khach khong ban hang
  // van mo duoc luong xu ly cua mot luot.
  owned('foundation', DebugModule),
  // `foundation`: moi khach deu co nguon, deu co ban thay ban, va deu co luc hai tai lieu noi
  // nguoc nhau. Cai khac nhau giua cac khach la NOI DUNG cua nguon, khong phai co tang nay hay
  // khong — nen no khong phai mot capability de bat/tat.
  owned('foundation', SourceRegistryModule),
  // `foundation`: moi khach deu can tra loi duoc "vi sao he thong da xu su nhu vay voi ca nay".
  // Nam SAU `SourceRegistryModule` vi no phu thuoc kho nguon su that de kiem mot `factId` gan vao
  // quyet dinh la co that va dung pham vi khach (muc 9 hop dong Issue #98). Chieu phu thuoc chi
  // MOT huong: nguon su that khong biet gi ve so cai — su that ton tai truoc quyet dinh dung no.
  owned('foundation', DecisionLedgerModule),
  // `foundation`: moi khach deu co tep. `#287` — cai khac nhau giua cac khach la MIEN NAO gan tep
  // vao cai gi, va dieu do do so dang ky quyen quyet (tuc do cac module mien thuc su duoc nap),
  // khong do mot co bat/tat o day. Xem khoi chu thich cua `FilesModule`.
  owned('foundation', FilesModule),
  // VAN TAI — LOI. Mang theo `AuditLogService` cua chinh no vi `transport-core` khong bat buoc
  // keo theo `operations`; xem chu thich trong `transport.module.ts`.
  owned('transport-core', TransportModule),
  // GIA THANH + SO QUY. Den cung `transport-costing` va bien mat cung no: mot khach van tai chi
  // theo doi doi xe va chuyen khong co mot bang so cai nao duoc nap.
  owned('transport-costing', TransportCostingModule),
  // CHI SO VAN HANH (`R8`, #237). Den cung `transport-costing` va bien mat cung no: bien truc tiep
  // khong co nghia neu khong ai ghi chi phi truc tiep. KHONG phai mot capability moi — xem khoi ghi
  // chu cua `transport-analytics.module.ts`.
  owned('transport-costing', TransportAnalyticsModule),
  // NHIEN LIEU + DOI SOAT BANG KE. Den cung `transport-fuel` va bien mat cung no: mot khach van
  // tai chua doi soat bang ke cay xang khong duoc nap tam bang nao cua `TX-04`.
  owned('transport-fuel', TransportFuelModule),
  // CAU NOI phan bo gia thanh nhien lieu -> bien truc tiep cua vong chay (`#369` R-1). `@Global()`,
  // va CHI xuat mot cong CHI DOC.
  //
  // Den cung `transport-fuel` va bien mat cung no: khach tat nhien lieu thi token khong ton tai,
  // `OperatingMetricsReadService` nhan `undefined` qua `@Optional()`, va `runMargin` cong bo
  // `FUEL_COST_ATTRIBUTION` trong `unavailableSources` — mot nguon vang mat DOC DUOC tren bao cao,
  // thay vi mot so 0 khong ai giai thich duoc.
  owned('transport-fuel', TransportFuelAnalyticsBridgeModule),
  // NAP DU LIEU ETC / PHI DUONG BO (Lane J, #269). Den cung `transport-toll` va bien mat cung no:
  // mot khach chua doi soat ETC khong duoc nap mot bang nao cua `TX-08` mo rong.
  owned('transport-toll', TransportTollModule),
  // QUYET TOAN AR/AP + HOA HONG + BIEN TRUC TIEP. Den cung `transport-settlement` va bien mat cung
  // no: mot khach van tai chua theo doi cong no khong duoc nap bang chung tu nao cua `TX-05`.
  owned('transport-settlement', TransportSettlementModule),
  // DOI SOAT KHACH HANG + PHAI THU (`#292`). Cung bien capability voi settlement: khi khong bat
  // quyet toan thi khong nap hang cho, batch, thanh toan hay phan bo nao.
  owned('transport-settlement', CustomerArModule),
  // BAO DUONG + GIAY TO + TRANG THAI HIEU LUC CUA XE. Den cung `transport-asset-compliance` va
  // bien mat cung no: mot khach chua theo doi han dang kiem khong duoc nap bang nao cua `TX-06`.
  owned('transport-asset-compliance', TransportAssetComplianceModule),
  // LUONG LAI XE. Den cung `transport-workforce` va bien mat cung no.
  owned('transport-workforce', TransportWorkforceModule),
  // CHI TIEN CHO LAI XE + PHAN BO (`TX-07b`, #237). Cung chu so huu voi bang luong, va do la mot
  // khang dinh: nguon cua moi khoan da ghi nhan la `TransportPayslip`, nen mot khach bat luong ma
  // khong bat quyet toan se co bang luong khong bao gio tra duoc thanh tien.
  owned('transport-workforce', TransportDriverSettlementModule),
  // BAM VI TRI. Mot khach van tai KHONG bat capability nay thi khong co mot bang toa do nao, va
  // do la mot cau hinh hop le — xem khoi chu thich cua `transport-proof` trong `tenant.schema.ts`.
  owned('transport-proof', TransportProofModule),
  // MOC VAN HANH + TAI LIEU HIEN TRUONG + THOI GIAN CHO (`#243`). Den cung `transport-checkpoint`
  // va bien mat cung no: mot khach khong co cong de vao va khong co can de can thi khong mang
  // theo chin loai moc cua cong ty B.
  owned('transport-checkpoint', TransportCheckpointModule),
  // CAU NOI phu cap cho -> bang luong (`#279` O6). `@Global()`, va CHI xuat mot cong CHI DOC.
  //
  // Den cung `transport-checkpoint` va bien mat cung no: khach tat moc hien truong thi token khong
  // ton tai, `WorkforceService` nhan `undefined` qua `@Optional()`, va lan chay luong ghi
  // `WAITING_ALLOWANCE_UNAVAILABLE` — mot dau vao vang mat DOC DUOC tren phieu, thay vi mot so
  // khong khong ai giai thich duoc.
  owned('transport-checkpoint', TransportWaitingPayrollBridgeModule),
  // CHUNG TU VAN HANH + BAN GIAO BIEN NHAN GIAY (`#279` O1/O7). Den cung `transport-checkpoint`:
  // mot khach co cong de vao va can de can cung la khach co phieu cong va phieu can.
  owned('transport-checkpoint', TransportDocumentModule),
  // CAU NOI chung tu -> cong nghiem thu cua Lane K. `@Global()`, CHI xuat mot adapter CHI DOC.
  //
  // Vang mat thi `transport-acceptance` giu nguyen `NoOperationalDocumentsAdapter` — FAIL-CLOSED,
  // dung hinh dang `main` da co truoc tranche nay. Bo cau noi KHONG mo mot lo hong nao.
  owned('transport-checkpoint', TransportDocumentEvidenceBridgeModule),
  // MAN HINH HIEN TRUONG (`#279` O9/O11) — CHI DOC. Gop bon nguon da co (moc, phien cho, chung tu,
  // ban giao) thanh mot danh sach NUT ma lai xe bam duoc ngay. Khong mot kho moi, khong mot
  // migration nao.
  owned('transport-checkpoint', TransportFieldModule),
  // NHAN VIEC TAI DIA DIEM A (`#267`). Den cung `transport-site-intake` va bien mat cung no: mot
  // khach dieu xe tu van phong khong co nut `Tao chuyen` tren dien thoai lai xe, va do la mot cau
  // hinh hop le — xem khoi chu cua `transport-site-intake.module.ts`.
  owned('transport-site-intake', TransportSiteIntakeModule),
  // NGHIEM THU CHUNG TU / THUONG MAI (`#268`). Den cung `transport-acceptance` va bien mat cung
  // no — nhung mot khach bat `transport-settlement` KHONG duoc phep tat no: xem khoi phu thuoc
  // trong `tenant.schema.ts`. Mot cong tai chinh co che do tat thi khong con la mot cong.
  owned('transport-acceptance', TransportAcceptanceModule),
];

const CONTROLLERS: readonly Owned<Type<unknown>>[] = [
  owned('foundation', HealthController),
  owned('foundation', FilesController),
  owned('sales-order', OrdersController),
  // Duong QUAY LAI cua worker workflow. Den cung `sales-order` va bien mat cung no: mot khach
  // khong ban hang khong co viec ban giao nao de theo doi.
  owned('sales-order', SalesHandoffController),
  owned('turn-processing', MessagesController),
  // Bo MO PHONG cua duong xu ly luot, khong phai mot man hinh ban hang: `/demo/simulate` la cong
  // duy nhat chay tron pipeline that ma khong can Zalo (smoke test deploy, do tre observability,
  // eval parser). Khach trung tinh phai chay thu duoc mot luot.
  owned('turn-processing', DemoController),
  owned('sales-order', ErpController),
  owned('knowledge', KnowledgeController),
  owned('messaging', BroadcastController),
  owned('turn-processing', StreamController),
  owned('messaging', ZaloController),
  owned('operations', SettingsController),
  owned('campaign', CampaignController),
  // Suc khoe kho anh KHACH GUI VAO (`MediaStore`) — ca hai dependency deu thuoc `turn-processing`.
  owned('turn-processing', MediaHealthController),
  // ANH CATALOG SAN PHAM thuoc `knowledge`, khong thuoc ban hang.
  //
  // `ContentService` (knowledge) doi locator tuong doi cua goi khach (`/media/catalog/...`) thanh
  // URL tuyet doi roi dua vao `images`/`links` — tuc URL do di THANG toi khach qua Zalo. Route
  // phuc vu chinh nhung byte do phai o cung capability, neu khong thi mot khach co tri thuc ma
  // khong ban hang se gui di mot duong dan anh ma chinh API cua no tra 404: khong ngoai le, khong
  // canh bao, chi la mot tin nhan den noi thieu anh.
  owned('knowledge', CatalogMediaController),
  owned('operations', MasterDataController),
  owned('operations', ReadinessController),
  owned('notifications', NotificationsController),
  owned('notifications', SettingsNotificationsController),
  owned('transport-core', FleetController),
  // THAP DIEU HANH (Lane G, #244) — den cung `transport-core`. Service dung sau no doc them BA
  // nguon TUY CHON o ba capability khac; xem khoi PROVIDERS ben duoi.
  owned('transport-core', ControlTowerController),
  owned('transport-core', JourneyController),
  owned('transport-core', InsightController),
  // DANH TINH PHAP NHAN (R1-A, #230) — cong them, khong hang nao cua v1 phu thuoc no.
  owned('transport-core', CounterpartyController),
  // `#267` H1: dia diem van hanh la mot MAT cua ho so phap nhan, nen no den/di cung `transport-core`
  // chu khong cung capability nhan dang. Mot khach khai kho cua khach hang minh ma khong bat bam
  // vi tri la mot cau hinh hop le.
  owned('transport-core', CounterpartySitesController),
  /*
   * `TX-08` so huu tai san. Ca hai thuoc `transport-core` — quyen so huu la mot su that ve chinh
   * chiec xe, khong phai mot lop nghiep vu them vao, nen khach nao bat duoc doi xe thi cung tra loi
   * duoc "ai so huu no". Be mat ben huu quan di kem: khong co no thi so dang ky chi la du lieu chet.
   */
  owned('transport-core', AssetOwnershipController),
  owned('transport-core', StakeholderVehiclesController),
  // MO HINH VAN CHUYEN v2 (R1-B, #232 `D-01`) -- cong them. Khong duong nao cua v1 phu thuoc
  // hai controller nay, va `TransportTrip` khong doi mot cot nao.
  owned('transport-core', TransportOrdersController),
  owned('transport-core', RunsController),
  /*
   * DIEU XE (Lane M, #277) — den cung `transport-core` va bien mat cung no.
   *
   * `transport-core` chu khong `transport-proof`, du be mat nay doc vi tri xe: cau hoi *"xe nao
   * nen nhan don nay"* van tra loi duoc khi khach chua bat bam vi tri — luc do moi xe deu
   * `LOCATION_CAPABILITY_ABSENT` va bang xep hang chay bang phep chieu tu cac chang da lap ke
   * hoach. Dat no o `transport-proof` se lam mot khach co doi xe nhung khong bam vi tri mat han
   * mot be mat ma ho VAN dung duoc.
   */
  owned('transport-core', DispatchController),
  /*
   * TIM DIA DIEM cho man tao don (#379) — cung `transport-core`: tao don la viec cua capability
   * loi, va tim diem lay/giao la mot phan cua tao don. Nha cung cap tim kiem mac dinh TAT; so dia
   * diem da biet la mot cong TUY CHON cua `transport-proof` (xem khoi PROVIDERS).
   */
  owned('transport-core', TransportPlacesController),
  /*
   * LAP KE HOACH VONG CHAY DO HE THONG QUAN (Lane L, #276) — cung `transport-core`, khong mot
   * capability moi.
   *
   * Ly do: lop nay khong doc mot capability nao khac. No ghi qua chinh `MovementService`, doc
   * `FleetRepository` de kiem xe, va doc cau hinh cua goi khach. Tach ra thanh capability rieng
   * se bat moi khach van tai dang chay phai them mot dong vao `capabilities` chi de giu nguyen
   * kha nang gan don vao xe — tuc mot lan doi hinh dang goi khach ma khong ai duoc gi.
   */
  owned('transport-core', TransportPlanningController),
  // DE NGHI CHI + CONG DUYET (R1-C, #232 `D-06`) -- thuoc `transport-costing`: mot de nghi chi
  // chi co nghia khi khach da bat so quy lai xe.
  owned('transport-costing', ExpenseClaimsController),
  owned('transport-costing', DriverExpenseClaimsController),
  owned('transport-core', TripsController),
  // BE MAT LAI XE — route rieng, khong phai mot nhanh `if` trong `TripsController` (`GD-23`).
  // Den cung `transport-core` va bien mat cung no.
  owned('transport-core', DriverTripsController),
  // CHI SO VAN HANH — CHI DOC, khong mot route ghi nao (#237: *"AI does not rewrite facts"*).
  owned('transport-costing', TransportAnalyticsController),
  owned('transport-costing', TripExpensesController),
  owned('transport-costing', DriverFundController),
  // SO QUY CUA CHINH TOI — route rieng, cung ly le voi `DriverTripsController` (`GD-23`).
  owned('transport-costing', DriverFundSelfController),
  // KHOAN CHI CUA CHINH TOI (`#168 B3`/`B4`) — route rieng, cung ly le. Den cung `transport-costing`
  // va bien mat cung no: mot khach khong bat gia thanh thi khong co "khoan chi" de lai xe tu ghi.
  owned('transport-costing', DriverExpensesSelfController),
  // ANH BANG CHUNG cho KHOAN CHI cua chinh lai xe (`#169` acceptance 4). Thuoc `transport-costing`
  // chu khong `transport-fuel`: no ghi mot `TripExpense`, va `CostingService` chi ton tai o day.
  // Kho anh no dung den nam o `transport-core` — xem khoi PROVIDERS.
  owned('transport-costing', DriverExpenseEvidenceController),
  owned('transport-fuel', FuelEntriesController),
  // DANH MUC CAY XANG (Lane C / C1) — den cung `transport-fuel`, KHONG mot capability moi.
  //
  // R0 §2 `F-12`: `CAPABILITY_IDS` la enum dong trong `packages/tenant`, nen them mot capability
  // buoc phai sua goi nen tang roi build lai — tuc cham dung vung ma #223/#224 dang lam viec. Tram
  // xang khong ton tai duoc neu khong co phieu do dau, nen no thuoc dung capability da co.
  owned('transport-fuel', FuelStationController),
  // CHUNG TU NGUON NHIEN LIEU (Lane C / C2) — cung capability, cung ly le voi tram xang.
  owned('transport-fuel', FuelDocumentController),
  owned('transport-fuel', FuelReconciliationController),
  // PHIEU DAU CUA CHINH TOI — route rieng, cung ly le voi `DriverTripsController` (`GD-23`).
  owned('transport-fuel', DriverFuelController),
  // BANG CHUNG (`#169`) — hai be mat rieng, dung khuon `GD-23`. Den cung `transport-fuel` va bien
  // mat cung no: khong co phieu dau thi khong co anh phieu dau de xem.
  owned('transport-fuel', DriverFuelEvidenceController),
  owned('transport-fuel', FuelEvidenceController),
  // DRILL-DOWN TIEU HAO theo xe/ky (`#313`) — mot route GET chi doc, cung capability, KHONG mot ma
  // quyen moi (`transport.fuel.entry.read`).
  owned('transport-fuel', FuelConsumptionController),
  // PHAN BO GIA THANH phieu Run-first (`#364`) — lop RIENG khoi su that "xe vua do dau". Cung
  // capability; hai duong ghi mang ma rieng `transport.fuel.cost_attribution.record`.
  owned('transport-fuel', FuelCostAttributionController),
  // ETC — tai khoan giao thong, nap nguon, va hop thu doi soat. MOT controller cho ca ba vi chung
  // dung chung mot tien to route va mot vong doi; ba ma quyen RIENG moi la thu tach chung ra.
  owned('transport-toll', TollController),
  // `TX-06` — bao duong, giay to, trang thai hieu luc cua doi xe.
  owned('transport-asset-compliance', MaintenanceController),
  owned('transport-asset-compliance', ComplianceController),
  owned('transport-asset-compliance', FleetStatusController),
  // BANG CANH BAO GOM CHUNG — thuoc `TX-06`, nhung service dung sau no doc them hai nguon TUY
  // CHON o `transport-costing`/`transport-fuel`. Xem khoi PROVIDERS ben duoi.
  owned('transport-asset-compliance', OperationalAlertsController),
  // `TX-07` — ky luong, phieu luong.
  owned('transport-workforce', PayrollController),
  // PHIEU LUONG CUA CHINH TOI (`#168 B8`) — route rieng, cung ly le voi `DriverFuelController`.
  // Den cung `transport-workforce` va bien mat cung no: khong tinh luong thi khong co phieu de doc.
  owned('transport-workforce', DriverPayslipsController),
  // `TX-07b` (#237) — chi tien cho lai xe va phan bo theo thang. Be mat KE TOAN.
  owned('transport-workforce', DriverSettlementController),
  // BANG QUYET TOAN CUA CHINH TOI — route rieng, cung khuon `DriverPayslipsController`: chi `GET`,
  // danh tinh tu phien, va khong mot ma ghi nao duoc cap cho lai xe.
  owned('transport-workforce', DriverSettlementSelfController),
  // `TX-05` — BAO CAO quyet toan, CHI DOC (`#168 B1`). Capability nay chay tu T5 nhung chua tung co
  // mot duong HTTP nao; xem khoi chu thich cua controller ve vi sao khong co route ghi.
  owned('transport-settlement', SettlementReportsController),
  // Lane Q: be mat ghi tai chinh co cong quyen rieng va danh tinh lay tu phien.
  owned('transport-settlement', CustomerArController),
  // BANG TAI CHINH (Lane G, #244 G5) — den cung `transport-settlement`, va do la QUYET DINH ma
  // `docs/kien-truc/transport-domain-v2.md:1056-1063` bo ngo: capability nao so huu bao cao hop
  // nhat. Xem khoi PROVIDERS ben duoi cho cong tuy chon sang `TX-07b`.
  owned('transport-settlement', FinanceController),
  // BAM VI TRI CUA CHINH TOI — be mat lai xe, route rieng, cung ly le voi `DriverFuelController`.
  owned('transport-proof', DriverTrackingController),
  // BE MAT VAN HANH — HAI tuyen voi HAI quyen khac nhau (tom tat ⟂ duong di tho). Xem khoi chu
  // thich cua controller: gop chung mot quyen la bo mat cong "can-biet" cua lich su vi tri.
  owned('transport-proof', TrackingController),
  /**
   * CUA NHAP cua nguon vi tri THU HAI (`#297` T4) — mot duong GHI rieng, voi mot ma quyen rieng.
   *
   * Di cung `transport-proof` chu khong `transport-core`: mot khach van tai khong bam vi tri thi
   * cung khong nhap vi tri tu phan cung, va mo san mot duong ghi vao so bang chung cho ho la mo
   * mot be mat khong ai dung.
   */
  owned('transport-proof', TelematicsIngressController),
  // CHUNG CU VAN HANH CUA CHINH TOI — byte anh di qua `TransportEvidenceService` (`MediaStore`),
  // khong dung kho tep thu hai. Dang ky o goc vi no can dich vu do, giong
  // `DriverFuelEvidenceController`.
  owned('transport-proof', DriverProofController),
  // BE MAT NGUOI DUYET — doc tom tat chung cu, bia mo mot chung cu, khai hang rao. BA quyen tach
  // roi: ke toan doc duoc, nhung khong rut duoc chung cu va khong doi duoc ban kinh mot hang rao
  // (hang rao cham LUC DOC, nen sua no doi ket luan cua ca nhung lan giao da xong).
  owned('transport-proof', ProofReviewController),
  /*
   * DIA DIEM VAN HANH (`#395`) — bai xe, kho khach hang, nha may doi tac: MOT so, la so hang rao.
   * Di cung `transport-proof` vi so hang rao la cua capability do; controller chi tiem
   * `PlaceAdminService` ma `TransportProofModule` export.
   */
  owned('transport-proof', PlaceAdminController),
  // MOC VAN HANH — HAI be mat, HAI quyen, HAI duong ghi khac nhau. Be mat lai xe ghi kem chung cu
  // vi tri va chi tren vong chay cua chinh ho; be mat van hanh ghi duoc moi vong chay nhung KHONG
  // dinh kem chung cu vi tri. Xem `CheckpointService`: hai duong do tach han o tang dich vu.
  owned('transport-checkpoint', DriverCheckpointsController),
  owned('transport-site-intake', DriverSiteIntakeController),
  owned('transport-checkpoint', CheckpointsController),
  /**
   * PHIEN CHO NGUOI NHAN (`#279` O5) — cung capability, cung khuon HAI be mat.
   *
   * Be mat lai xe co DUNG MOT duong ghi (`Bat dau cho`) va khong co duong dong: mot phien dong lai
   * boi chinh moc `Khach da nhan hang`. Be mat van hanh doc duoc moi phien va dong duoc mot phien
   * bo quen — nhung ma `transport.waiting.close` nam trong `ACCOUNTING_DENIED`, vi gio dong la moc
   * tren cua khoang thoi gian ma Ke toan sap duyet tien cho.
   */
  owned('transport-checkpoint', DriverWaitingController),
  owned('transport-checkpoint', WaitingController),
  // PHU CAP CHO (`#279` O6) — MOT be mat, va KHONG co ban 'cua chinh minh' cho lai xe. Ca hai ma
  // quyen deu nam ngoai `SELF_SCOPE_ACTIONS`, nen vai `SALE` khong goi duoc mot duong nao: mot lai
  // xe tu de nghi roi tu duyet phu cap cho chinh minh la dung cai ma kiem soat noi bo sinh ra de
  // chan. Cong THAT chong tu duyet con nam o tang dich vu, tren `Driver.authUserId`.
  owned('transport-checkpoint', WaitingAllowanceController),
  // CHUNG TU VAN HANH — HAI be mat, HAI quyen. Be mat lai xe ghi kem moc neo CUA CHINH HO va KHONG
  // co duong bia mo; be mat van hanh ghi bu duoc cho moi vong chay va bia mo duoc — nhung ma
  // `transport.operational_document.withdraw` nam trong `ACCOUNTING_DENIED`.
  owned('transport-checkpoint', DriverDocumentsController),
  owned('transport-checkpoint', DocumentsController),
  // MAN HINH HIEN TRUONG — MOT tuyen, CHI DOC. Moi nut no tra ve tro toi mot tuyen ghi DA CO, nen
  // khong mot duong ghi thu hai nao ra doi cung man hinh nay.
  owned('transport-checkpoint', DriverFieldController),
  // HANG CHO NGHIEM THU CHUNG TU — MOT be mat, va KHONG co ban 'cua chinh minh' cho lai xe.
  // Ca hai ma quyen deu nam ngoai `SELF_SCOPE_ACTIONS`, nen vai `SALE` khong goi duoc mot duong
  // nao o day: mot lai xe tu nghiem thu chuyen cua chinh minh la dung cai ma kiem soat noi bo
  // sinh ra de chan.
  owned('transport-acceptance', CommercialAcceptanceController),
];

const guardProviders: readonly Provider[] = [
  /**
   * PHAI DUNG DAU. Thu tu dang ky `APP_GUARD` chinh la thu tu chay, va ba guard nguoi-dung phia
   * duoi doc DAU do guard nay dat len yeu cau. Doi cho no xuong duoi nghia la worker bi 401
   * truoc khi ai kip kiem khoa dich vu cua no.
   */
  InternalServiceGuard,
  ApiKeyGuard,
  SessionAuthGuard,
  CsrfGuard,
  RolesGuard,
  ThrottlerGuard,
].map((useClass) => ({ provide: APP_GUARD, useClass }));

const PROVIDERS: readonly Owned<Provider>[] = [
  /**
   * BANG CANH BAO VAN HANH GOM CHUNG — dang ky o TANG UNG DUNG, khong trong
   * `TransportAssetComplianceModule`.
   *
   * Ly do la cau truc chu khong so thich. Bang nay doc ba nguon nam o BA capability khac nhau:
   * giay to va bao duong cua `transport-asset-compliance`, tieu hao dau cua `transport-fuel`, so
   * du quy cua `transport-costing`. Neu module cua `TX-06` `imports` hai capability sau thi no
   * khong con bat duoc mot minh — tuc pha dung cai `dependencies: ['transport-core']` ma T1 §10.1
   * hua, va mot khach chi muon theo doi han dang kiem se bi bat khai ca doi soat bang ke.
   *
   * O tang nay, hai adapter chi TON TAI khi capability so huu chung duoc bat. Khi vang mat,
   * `OperationalAlertsService` nhan `undefined` qua `@Optional()` va phat ra `unavailableSources`
   * — bang canh bao noi thang rang mot muc dang thieu, thay vi doc giong nhu moi thu deu on.
   */
  owned('transport-asset-compliance', OperationalAlertsService),
  owned('transport-fuel', {
    provide: AlertFuelConsumptionSource,
    useClass: FuelReviewAlertAdapter,
  }),
  owned('transport-costing', { provide: AlertDriverFundSource, useClass: CostingFundAlertAdapter }),
  /**
   * THAP DIEU HANH — dang ky o TANG UNG DUNG, cung ly le CAU TRUC voi bang canh bao ngay tren.
   *
   * Bang doc BON nguon o BON capability: vong chay/doi xe cua `transport-core`, de nghi chi cua
   * `transport-costing`, phieu dau + ky doi soat cua `transport-fuel`, canh bao giay to/bao duong
   * cua `transport-asset-compliance`. Neu `TransportModule` `imports` ba module sau thi
   * `transport-core` khong con bat duoc mot minh — pha dung `dependencies: []` ma T1 §10.1 hua.
   *
   * Cong LOI di cung `transport-core` va khong bao gio vang: khong co vong chay thi khong co bang.
   * Ba cong con lai chi TON TAI khi capability so huu chung duoc bat; khi vang mat,
   * `ControlTowerReadService` nhan `undefined` qua `@Optional()` va phat ra `unavailableSources`.
   */
  owned('transport-core', ControlTowerReadService),
  owned('transport-core', {
    provide: ControlTowerCoreFacts,
    useClass: ControlTowerCoreFactsAdapter,
  }),
  owned('transport-costing', {
    provide: ControlTowerClaimFacts,
    useClass: ControlTowerClaimFactsAdapter,
  }),
  owned('transport-fuel', {
    provide: ControlTowerFuelFacts,
    useClass: ControlTowerFuelFactsAdapter,
  }),
  owned('transport-asset-compliance', {
    provide: ControlTowerAlertFacts,
    useClass: ControlTowerAlertFactsAdapter,
  }),
  /*
   * DIEU XE (Lane M, #277). Cung khuon voi thap dieu hanh: mot cong LOI bat buoc va hai cong TUY
   * CHON o hai capability khac.
   *
   * `TransportRoutingPort` duoc dung bang mot `useFactory` doc bien moi truong. Mac dinh — va la
   * duong duy nhat chay hom nay — la bo uoc luong TONG HOP: khong khoa, khong goi mang, tat dinh
   * trong CI. Xem `routing-provider.factory.ts` cho ly do bien do khong nam trong `foundation-env`.
   */
  owned('transport-core', {
    provide: TRANSPORT_DISPATCH_POLICY,
    useValue: DEFAULT_TRANSPORT_DISPATCH_POLICY,
  }),
  owned('transport-core', {
    provide: TransportRoutingPort,
    useFactory: () => createRoutingPort(DEFAULT_TRANSPORT_DISPATCH_POLICY, process.env),
  }),
  owned('transport-core', { provide: DispatchCoreFacts, useClass: DispatchCoreFactsAdapter }),
  owned('transport-proof', {
    provide: DispatchLocationFacts,
    useClass: DispatchLocationFactsAdapter,
  }),
  owned('transport-asset-compliance', {
    provide: DispatchComplianceFacts,
    useClass: DispatchComplianceFactsAdapter,
  }),
  /*
   * CONG GHI cua Lane M -> bo lap ke hoach cua Lane L (#276, da len `main` o `41e9bbe`).
   *
   * `#274` giao quyen ghi ke hoach cho Lane L. Mot ban hien thuc thu hai o Lane M — du dung — se
   * de trong he hai bo luat gom don, va lan lech dau tien se khong ai biet ben nao dung.
   */
  owned('transport-core', {
    provide: DispatchAssignmentPlanner,
    useClass: PlanningDispatchAssignmentPlanner,
  }),
  owned('transport-core', DispatchService),
  /*
   * TIM DIA DIEM (#379). Cung khuon dieu xe: cong tim kiem duoc dung bang `useFactory` doc bien
   * moi truong CUC BO (`TRANSPORT_PLACE_SEARCH_*`, xem `place-search-provider.factory.ts`) —
   * mac dinh TAT, khong goi mang, tat dinh trong CI.
   *
   * `KnownPlacesFacts` doc so hang rao cua `transport-proof`, nen den/di cung capability do.
   * Vang mat thi `TransportPlaceService` nhan `undefined` va man hinh noi "chua co so dia diem".
   */
  owned('transport-core', {
    provide: TransportPlaceSearchPort,
    useFactory: () => createPlaceSearchPort(process.env),
  }),
  owned('transport-core', TransportPlaceService),
  owned('transport-proof', { provide: KnownPlacesFacts, useClass: KnownPlacesFactsAdapter }),
  /**
   * DONG VONG CHAY DO HE THONG QUAN (`#293` Lane R).
   *
   * Ba dong, va thu tu cua chung la mot phan cua hop dong:
   *
   *   · `RunClosureService` la DUONG PHAN XU DUY NHAT — controller va luot quet deu di qua no;
   *   · `RunClosureSweepScheduler` danh thuc no theo nhip, khong giu trang thai nao;
   *   · `RunClosureBlockerSource` mac dinh la RONG — mot khach chi bat `transport-core` khong co
   *     nguon su that ben ngoai nao de hoi, va do la mot cau hinh hop le.
   *
   * Dong cuoi bi GHI DE boi capability so huu du lieu (xem `transport-checkpoint` ben duoi). No
   * nam TRUOC dong ghi de do, va thu tu do la co y: Nest lay provider CUOI CUNG cho mot token.
   */
  owned('transport-core', RunClosureService),
  owned('transport-core', RunClosureSweepScheduler),
  owned('transport-core', {
    provide: RunClosureBlockerSource,
    useClass: NoRunClosureBlockerSource,
  }),
  /**
   * SO GHI HIEN TRUONG CUA CHANG (`#332`) — cung khuon ngay tren: mac dinh RONG o `transport-core`
   * (khong co moc thi khong co gi de doi chieu), GHI DE boi `transport-checkpoint` ben duoi. Thu tu
   * la hop dong: ban ghi de phai nam SAU dong nay.
   */
  owned('transport-core', { provide: LegFieldTruthSource, useClass: NoLegFieldTruthSource }),
  /**
   * MOC HIEN TRUONG (`#243` F1) — cong thu NAM, va la cong doi ban chat cua bang.
   *
   * Bon cong tren chi them MUC vao hang viec. Cong nay quyet dinh ba COT cua bang dieu hanh
   * (`PICKUP`/`LOADING`/`ARRIVED`) va truong `currentLeg.phase` cua moi the. Khach tat
   * `transport-checkpoint` thi ba cot do van nam tren bang, RONG, kem `AWAITING_CHECKPOINT_SOURCE`
   * — chinh xac hinh dang ma bang da co truoc tranche nay.
   */
  owned('transport-checkpoint', {
    provide: ControlTowerCheckpointFacts,
    useClass: ControlTowerCheckpointFactsAdapter,
  }),
  /**
   * HAI SU THAT CHAN DONG — `#293` R4. GHI DE ban mac dinh rong cua `transport-core`.
   *
   *   · HANG TREN THUNG (`CARGO_STILL_CARRIED`) — suy tu mot phep chieu DA DUOC CHAP NHAN
   *     (`buildRunTimeline()` cua `#243` F6), khong tu mot bang hay mot cot trang thai moi;
   *   · PHIEN CHO DANG MO (`OPEN_WAITING_SESSION`) — doc thang tren bang cua `#279` O5, sau khi
   *     `#290` vao `main`. Truoc do ma nay chi ton tai trong bo test.
   *
   * Hai dong tren la HAI provider rieng, KHONG phai hai ban ghi cho cung mot token: Nest lay
   * provider cuoi cung, nen dang ky ca hai vao `RunClosureBlockerSource` se lam mot trong hai bien
   * mat lang le. Chung gap nhau o `TransportCheckpointRunClosureBlockerSource`.
   *
   * Khach tat `transport-checkpoint` thi ca ba dong bien mat cung capability do, va ban mac dinh
   * rong cua `transport-core` quay lai — tuc he thong khong hoi mot nguon khong ton tai, chu khong
   * phai hoi roi nhan ve mot cau tra loi gia.
   */
  owned('transport-checkpoint', CheckpointRunClosureBlockerSource),
  owned('transport-checkpoint', WaitingRunClosureBlockerSource),
  owned('transport-checkpoint', {
    provide: RunClosureBlockerSource,
    useClass: TransportCheckpointRunClosureBlockerSource,
  }),
  /**
   * CHANG CO HANG KHONG "XONG" TRAI HIEN TRUONG (`#332`) — GHI DE ban rong cua `transport-core`.
   * `RunsController.transitionLeg` hoi no truoc khi hoan tat mot chang `LOADED`.
   */
  owned('transport-checkpoint', {
    provide: LegFieldTruthSource,
    useClass: CheckpointLegFieldTruthSource,
  }),
  /**
   * NGUON HIEN TRUONG (`#279` O11) — cong thu SAU cua thap dieu hanh.
   *
   * TACH khoi `ControlTowerCheckpointFacts` du hai cong cung mot capability, va do la mot khac biet
   * co that o man hinh: vang mat cong moc thi ba cot giai doan trong; vang mat cong nay thi cot
   * `WAITING` trong va hai muc hang viec bien mat. Gop lam mot se lam nguoi truc khong biet cai nao
   * dang thieu.
   *
   * Dien ba cho trong ma Lane N da dat san ten trong `control-tower.types.ts`.
   */
  owned('transport-checkpoint', {
    provide: ControlTowerFieldFacts,
    useClass: ControlTowerFieldFactsAdapter,
  }),
  /**
   * BAO CAO BAN DO CUA MOT VONG CHAY (`#278` N5) — cung khuon thap dieu hanh.
   *
   * Cong LOI di cung `transport-core`: khong co vong chay thi khong co bao cao. Ba cong con lai
   * quyet dinh bao cao co BAN DO hay khong, va chung den/di cung capability so huu du lieu:
   * moc (`transport-checkpoint`), toa do (`transport-proof`), phieu do dau (`transport-fuel`).
   *
   * Khach tat ca ba thi bao cao van dung: chang, km co hang/rong, ma don — chi khong co ban do va
   * khong co dong thoi gian, va `unavailableSources` noi ra dieu do.
   */
  owned('transport-core', JourneyReadService),
  owned('transport-core', { provide: JourneyCoreFacts, useClass: JourneyCoreFactsAdapter }),
  owned('transport-checkpoint', {
    provide: JourneyCheckpointFacts,
    useClass: JourneyCheckpointFactsAdapter,
  }),
  owned('transport-proof', {
    provide: JourneyLocationFacts,
    useClass: JourneyLocationFactsAdapter,
  }),
  owned('transport-fuel', { provide: JourneyFuelFacts, useClass: JourneyFuelFactsAdapter }),
  /**
   * BANG DOI XE + BAO CAO TUYEN (`#278` N6/N7) — MOT cong, di cung `transport-core`.
   *
   * Khac hai bao cao tren: o day khong co cong tuy chon nao. Ca hai chi doc vong chay, chang, xe va
   * don — bon thu deu thuoc `transport-core` — nen khong co gi de vang mat, va cung khong co
   * `unavailableSources` de cong bo.
   */
  owned('transport-core', InsightReadService),
  owned('transport-core', { provide: InsightCoreFacts, useClass: InsightCoreFactsAdapter }),
  /**
   * BE MAT BEN HUU QUAN — PHAN HOAT DONG (`#278` N9).
   *
   * Dich vu di cung `transport-core`: no doc vong chay, chang va xe — dung nhung thu ma man hinh
   * "Xe toi co co phan" da dung san.
   *
   * Cong BAO DUONG thi KHONG: so ngay nghi thuoc `transport-asset-compliance`. Khach tat capability
   * do van mo duoc bang — cot so ngay nghi la mot dau gach kem `MAINTENANCE_CAPABILITY_OFF`, chu
   * khong phai mot so `0` doc y het "xe chay du thang".
   */
  owned('transport-core', StakeholderActivityService),
  owned('transport-asset-compliance', {
    provide: StakeholderMaintenanceFacts,
    useClass: StakeholderMaintenanceFactsAdapter,
  }),
  /**
   * BANG TAI CHINH — cung khuon, va cung mot ly le cau truc.
   *
   * Cong LOI di cung `transport-settlement`: khong co bon dong tien thi khong co bang. Cong HAI SO
   * LAI XE (`TX-07b`) di cung `transport-workforce` — mot khach bat quyet toan ma khong tinh luong
   * van co bang, chi thieu hai o cuoi, va bang cong bo dieu do qua `unavailableSources`.
   */
  owned('transport-settlement', FinanceReadService),
  owned('transport-settlement', {
    provide: FinanceSettlementFacts,
    useClass: FinanceSettlementFactsAdapter,
  }),
  /*
   * `#385` — cua so VIEC Run-first. Cung `transport-settlement`: capability do phu thuoc core,
   * costing lan fuel, nen ca bon thu adapter tiem (`MovementRepository`, `OperatingMetricsReadService`,
   * hai kho nhien lieu) luon co mat khi bang tai chinh co mat.
   */
  owned('transport-settlement', {
    provide: FinanceRunFirstFacts,
    useClass: FinanceRunFirstFactsAdapter,
  }),
  owned('transport-workforce', {
    provide: FinanceDriverBalanceFacts,
    useClass: FinanceDriverBalanceFactsAdapter,
  }),
  ...guardProviders.map((provider) => owned('foundation' as const, provider)),
  owned('operations', RuntimeSettingsService),
  owned('turn-processing', AgentEventsService),
  // Kho LUOT — trung tinh. Bang Postgres van ten `Order` (khong di tru du lieu), nhung QUYEN SO
  // HUU thi khong: moi y dinh deu sinh mot ban ghi o day, ke ca o khach khong ban gi.
  owned('turn-processing', {
    provide: TurnRecordsRepository,
    useFactory: (prisma: PrismaService): TurnRecordsRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaOrdersRepository(prisma)
        : new InMemoryTurnRecordsRepository(),
    inject: [PrismaService],
  }),
  // `OrdersRepository` la CUNG MOT INSTANCE, doc bang ngon ngu don hang. `useExisting` chu khong
  // phai mot factory thu hai: hai kho tach roi la cach chac chan de don va luot lech nhau.
  owned('sales-order', { provide: OrdersRepository, useExisting: TurnRecordsRepository }),
  /*
   * SO GHI BANG CHUNG cho diem nghen gui (Issue #205).
   *
   * `useExisting` chu khong `useClass`: phai la CUNG MOT INSTANCE voi `ContentService`, neu
   * khong thi so ghi doc tu mot cache khac va mot lan `reload()` se khong nhin thay duoc.
   * Thuoc `knowledge` vi no doc tai lieu; khach khong co knowledge thi khong co cong nay, va
   * cung khong co ghim tai lieu nao de kiem.
   */
  owned('knowledge', { provide: EvidenceRegistry, useExisting: ContentService }),
  owned('turn-processing', TurnReplyService),
  owned('turn-processing', ConversationContextBuilder),
  owned('turn-processing', {
    provide: ConversationThreadsRepository,
    useFactory: (prisma: PrismaService): ConversationThreadsRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaConversationThreadsRepository(prisma)
        : new InMemoryConversationThreadsRepository(),
    inject: [PrismaService],
  }),
  owned('turn-processing', ConversationsService),
  owned('operations', SettingsQueryService),
  owned('operations', GroupMappingService),
  owned('operations', GroupIdentityService),
  owned('operations', SourceTruthWriteService),
  owned('operations', {
    provide: MasterDataService,
    useFactory: (prisma: PrismaService, knowledge: KnowledgeService, audit: AuditLogService) =>
      new MasterDataService(prisma, knowledge, audit, loadFoundationEnv().PERSISTENCE),
    inject: [PrismaService, KnowledgeService, AuditLogService],
  }),
  owned('operations', ReadinessService),
  owned('campaign', {
    provide: CampaignRepository,
    useFactory: (prisma: PrismaService): CampaignRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaCampaignRepository(prisma)
        : new InMemoryCampaignRepository(),
    inject: [PrismaService],
  }),
  owned('campaign', { provide: CAMPAIGN_POLICY, useFactory: tenantCampaignConfig }),
  owned('campaign', {
    provide: 'CAMPAIGN_WORKER_ID',
    useFactory: () => `campaign-worker-${randomUUID()}`,
  }),
  // Kho TIN — thuoc `messaging`: nhan mot tin thi phai luu duoc no, ke ca khi khach khong bat
  // duong xu ly luot nao (CLAUDE.md: "Luu moi tin nhan/don ve DB ngay khi nhan").
  owned('messaging', {
    provide: MessagesRepository,
    useFactory: (prisma: PrismaService): MessagesRepository =>
      loadFoundationEnv().PERSISTENCE === 'prisma'
        ? new PrismaMessagesRepository(prisma)
        : new InMemoryMessagesRepository(),
    inject: [PrismaService],
  }),
  owned('messaging', OutboundRecorder),
  owned('sales-order', erpProvider),
  owned('turn-processing', mediaStoreProvider),
  // Kho anh CUA MIEN VAN TAI — token rieng, vi `mediaStoreProvider` thuoc `turn-processing` va
  // mot khach van tai khong bat capability do. Xem `transport/evidence/evidence.provider.ts`.
  //
  // `transport-core` chu khong `transport-fuel`, va do la mot SUA LOI so huu chu khong phai noi
  // long: `TransportEvidenceService` nhan byte va tra ve mot dinh vi duc — no khong biet gi ve
  // phieu dau. Tu #169 no co HAI nguoi tieu thu o hai capability khac nhau (phieu dau o
  // `transport-fuel`, khoan chi cua lai xe o `transport-costing`). Ghim kho vao mot trong hai se
  // lam do thi Nest cua khach kia KHONG DUNG NOI — mot khach bat gia thanh ma khong bat nhien lieu
  // se chet luc boot vi thieu token, chu khong phai mat mot tinh nang.
  owned('transport-core', transportEvidenceStoreProvider),
  owned('transport-core', transportEvidenceMaxBytesProvider),
  owned('transport-core', transportEvidenceServiceProvider),
  owned('knowledge', catalogStoreProvider),
  owned('turn-processing', mediaFetcherProvider),
  owned('turn-processing', parserProvider),
  // `foundation`, KHONG phai `messaging`: mot khach khong dung kenh Zalo van phai co `/health`
  // tra loi duoc — va cau tra loi dung cua no la `phase: 'disabled'`, chu khong phai mot khoi
  // vang mat. Mot cong suc khoe chi noi duoc su that khi no ton tai o moi ban trien khai.
  owned('foundation', ChannelHealthService),
  owned('messaging', ZaloUserClient),
  owned('messaging', BotIdentityService),
  ...namedChannelProviders.map((provider) => owned('messaging' as const, provider)),
  owned('messaging', channelProvider),
  owned('messaging', OutboundChannelRouter),
  owned('turn-processing', AgentOrchestrator),
  owned('turn-processing', PipelineService),
  owned('sales-order', OrdersService),
  owned('sales-order', SalesHandoffFollowupService),
  owned('sales-order', OrderAmendmentService),
  // CONG TU XAC NHAN DON — den cung `sales-order` va bien mat cung no.
  //
  // `turn-processing` cong bo mot cong TRUNG TINH (`TurnOutcomePort`: "co ai nhan luot nay
  // khong?"); ban hang la ben duy nhat hom nay cam vao do. Khach khong bat `sales-order` khong
  // co provider nao cho token nay, `PipelineService` nhan `undefined` qua `@Optional()`, va moi
  // luot di thang sang duong tra loi tu van — dung hanh vi cua mot khach khong ban gi.
  owned('sales-order', SalesOrderOutcomeService),
  owned('sales-order', { provide: TurnOutcomePort, useExisting: SalesOrderOutcomeService }),
  // Cong GHI cua agent. Dang ky RIENG khoi `AgentOrchestrator` de doc duoc tu day rang quyen
  // doi trang thai don la mot thu duoc CAP, khong phai mot thu orchestrator tu co.
  owned('sales-order', OrderCommandAdapter),
  owned('sales-order', { provide: ORDER_COMMANDS, useExisting: OrderCommandAdapter }),
  owned('messaging', BroadcastService),
  owned('campaign', CampaignService),
  owned('campaign', CampaignScheduler),
  // NGO VAO cua mot luot. Thuoc `turn-processing` chu khong phai `messaging` vi bang chung nam
  // trong chinh constructor: ca hai BAT BUOC co `PipelineService`. Mot listener khong co cho
  // giao tin la mot tien trinh doc PII roi vut di. `messaging` so huu ADAPTER (gui/nhan), con
  // ai NHAN VIEC tu adapter la chuyen cua duong xu ly luot.
  owned('turn-processing', BotPoller),
  owned('turn-processing', ZcaListener),
  owned('notifications', NotificationSettingsRepository),
  owned('notifications', EmailLeadDispatcher),
  owned('notifications', ZaloLeadDispatcher),
  owned('notifications', LeadDispatchService),
];

export interface AppComposition {
  readonly imports: NonNullable<ModuleMetadata['imports']>;
  readonly controllers: Type<unknown>[];
  readonly providers: Provider[];
}

/** Typed root composition only; Nest van so huu khoi tao/resolve provider, khong co Service Locator. */
export function buildAppComposition(capabilities: readonly CapabilityId[]): AppComposition {
  const enabled = new Set<CapabilityOwner>(['foundation', ...capabilities]);
  return {
    imports: IMPORTS.filter(({ owner }) => enabled.has(owner)).map(({ value }) => value),
    controllers: CONTROLLERS.filter(({ owner }) => enabled.has(owner)).map(({ value }) => value),
    providers: PROVIDERS.filter(({ owner }) => enabled.has(owner)).map(({ value }) => value),
  };
}
