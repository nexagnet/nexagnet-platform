/**
 * TEP DUOC SINH RA — dung sua tay.
 *
 * Sinh boi `node tools/source-manifest/generate.mjs`; `pnpm test:source-manifest` sinh lai roi
 * so voi tep nay, nen mot ban sua tay se lam CI do.
 *
 * Moi muc o day den tu AST cua `apps/api/src`. Ten nao xuat hien o hai cho tro len bi BO —
 * xem chu thich dau `tools/source-manifest/generate.mjs`.
 */
import type { SourceManifest } from './source-manifest.js';

export const SOURCE_MANIFEST: SourceManifest = {
  "repositoryUrl": "https://github.com/phungtienviet14-sketch/nexagnet-platform",
  "names": {
    "access.change": {
      "functionName": "AuthService.applyAccess",
      "filePath": "apps/api/src/auth/auth.service.ts"
    },
    "account.access.change": {
      "functionName": "AuthService.applyAccess",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 545
    },
    "account.create": {
      "functionName": "AuthService.createUser",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 290
    },
    "account.credentials.reset": {
      "functionName": "AuthService.resetPassword",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 506
    },
    "account.status.change": {
      "filePath": "apps/api/src/auth/auth.service.ts"
    },
    "agent.run": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 492
    },
    "audit.persist": {
      "functionName": "OrdersService.recordManualAction",
      "filePath": "apps/api/src/orders/orders.service.ts",
      "line": 577
    },
    "auth.credentials.change": {
      "functionName": "AuthService.changePassword",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 213
    },
    "auth.credentials.reset": {
      "functionName": "AuthService.resetPassword",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 519
    },
    "auth.production": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 78
    },
    "auth.user.access.change": {
      "functionName": "AuthService.applyAccess",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 551
    },
    "auth.user.access.escalate": {
      "functionName": "AuthService.escalationEntries",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 672
    },
    "auth.user.create": {
      "functionName": "AuthService.createUser",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 331
    },
    "auth.user.disable": {
      "functionName": "AuthService.disableUser",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 449
    },
    "auth.user.enable": {
      "functionName": "AuthService.enableUser",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 481
    },
    "auth.user.profile.update": {
      "functionName": "AuthService.updateProfile",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 375
    },
    "campaign.approve": {
      "functionName": "CampaignService.approve",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 68
    },
    "campaign.cancel": {
      "functionName": "CampaignService.cancel",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 113
    },
    "campaign.create": {
      "functionName": "CampaignService.create",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 57
    },
    "campaign.retry_failed": {
      "functionName": "CampaignService.retryFailed",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 123
    },
    "campaign.schedule": {
      "functionName": "CampaignService.schedule",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 103
    },
    "channel.production": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 70
    },
    "channel.send": {
      "filePath": "apps/api/src/channels/outbound-channel.router.ts"
    },
    "conversation.resolve": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 454
    },
    "costing.reversal": {
      "functionName": "CostingService.reverseCorrelation",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 545
    },
    "credentials.reset": {
      "functionName": "AuthService.resetPassword",
      "filePath": "apps/api/src/auth/auth.service.ts"
    },
    "dealers.configured": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 49
    },
    "document.record": {
      "filePath": "apps/api/src/transport/document/document.service.ts"
    },
    "document.withdraw": {
      "functionName": "OperationalDocumentService.withdraw",
      "filePath": "apps/api/src/transport/document/document.service.ts"
    },
    "driver.account_link": {
      "functionName": "DriverAccountLinkService.setDriverAccount",
      "filePath": "apps/api/src/transport/fleet/driver-account-link.service.ts",
      "line": 61
    },
    "driver_fund.post_entry": {
      "functionName": "CostingService.postEntryDetailed",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 218
    },
    "expense_claim.review": {
      "filePath": "apps/api/src/transport/claims/claim.service.ts"
    },
    "expense_claim.settle": {
      "functionName": "ExpenseClaimService.settle",
      "filePath": "apps/api/src/transport/claims/claim.service.ts"
    },
    "expense_claim.submit": {
      "filePath": "apps/api/src/transport/claims/claim.service.ts"
    },
    "file.activate": {
      "filePath": "apps/api/src/files/file.service.ts"
    },
    "file.attach": {
      "functionName": "FileService.createLink",
      "filePath": "apps/api/src/files/file.service.ts",
      "line": 552
    },
    "file.link": {
      "filePath": "apps/api/src/files/file.service.ts"
    },
    "file.quarantine": {
      "functionName": "FileService.runScanGate",
      "filePath": "apps/api/src/files/file.service.ts"
    },
    "file.read": {
      "filePath": "apps/api/src/files/file.service.ts"
    },
    "file.stage": {
      "functionName": "FileService.uploadInner",
      "filePath": "apps/api/src/files/file.service.ts"
    },
    "file.upload": {
      "filePath": "apps/api/src/files/file.service.ts"
    },
    "file.withdraw": {
      "functionName": "FileService.withdraw",
      "filePath": "apps/api/src/files/file.service.ts"
    },
    "fuel_document.extract": {
      "functionName": "FuelDocumentService.ingestReceiptImage",
      "filePath": "apps/api/src/transport/fuel/fuel-document.service.ts"
    },
    "fuel_document.ingest": {
      "filePath": "apps/api/src/transport/fuel/fuel-document.service.ts"
    },
    "fuel_document.supplier_link": {
      "functionName": "FuelDocumentService.linkSupplier",
      "filePath": "apps/api/src/transport/fuel/fuel-document.service.ts"
    },
    "fuel_station.alias": {
      "filePath": "apps/api/src/transport/fuel/fuel-station.service.ts"
    },
    "fuel_station.resolve": {
      "functionName": "FuelStationService.resolveStation",
      "filePath": "apps/api/src/transport/fuel/fuel-station.service.ts",
      "line": 331
    },
    "fuel_station.write": {
      "filePath": "apps/api/src/transport/fuel/fuel-station.service.ts"
    },
    "fuel_supplier.profile": {
      "functionName": "FuelStationService.updateSupplierProfile",
      "filePath": "apps/api/src/transport/fuel/fuel-station.service.ts"
    },
    "golden.evaluated": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 84
    },
    "groups.mapped": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 51
    },
    "media.production": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 64
    },
    "message.persist": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 194
    },
    "nexagnet.failure.reason": {
      "functionName": "OtelWorkerTraceBridge.finish",
      "filePath": "apps/api/src/observability/otel/otel-worker-trace-bridge.ts",
      "line": 153
    },
    "order.approve": {
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.cancel": {
      "functionName": "MovementService.cancelOrder",
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "order.complete_handoff": {
      "functionName": "OrdersService.completeSalesHandoff",
      "filePath": "apps/api/src/orders/orders.service.ts",
      "line": 235
    },
    "order.lifecycle_transition": {
      "functionName": "MovementService.transitionOrder",
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "order.location": {
      "functionName": "MovementService.recordOrderLocation",
      "filePath": "apps/api/src/transport/movement/movement.service.ts",
      "line": 1075
    },
    "order.manual_approve": {
      "functionName": "OrdersService.approveTurn",
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.manual_reject": {
      "functionName": "OrdersService.rejectTurn",
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.reject": {
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.sales_handoff": {
      "functionName": "OrdersService.completeSalesHandoffTurn",
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.sales_handoff.complete": {
      "functionName": "OrdersService.completeSalesHandoffTurn",
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.state": {
      "functionName": "grantsFromPersistedOrder",
      "filePath": "apps/api/src/outbound/outbound-authority.ts"
    },
    "order.trip_projection": {
      "functionName": "MovementService.projectTripOrder",
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "outbound.send_advice": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 536
    },
    "outbound.send_confirmation": {
      "functionName": "SalesOrderOutcomeService.settle",
      "filePath": "apps/api/src/orders/sales-order-outcome.service.ts",
      "line": 55
    },
    "ownership.interest.close": {
      "filePath": "apps/api/src/transport/asset-ownership/asset-ownership.service.ts"
    },
    "ownership.interest.record": {
      "filePath": "apps/api/src/transport/asset-ownership/asset-ownership.service.ts"
    },
    "ownership.register.declare": {
      "filePath": "apps/api/src/transport/asset-ownership/asset-ownership.service.ts"
    },
    "parser.production": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 57
    },
    "place.reverse": {
      "functionName": "TransportPlaceService.reverse",
      "filePath": "apps/api/src/transport/places/place.service.ts",
      "line": 85
    },
    "place.search": {
      "functionName": "TransportPlaceService.search",
      "filePath": "apps/api/src/transport/places/place.service.ts",
      "line": 57
    },
    "place.write": {
      "functionName": "PlaceAdminService.write",
      "filePath": "apps/api/src/transport/places/admin/place-admin.service.ts",
      "line": 607
    },
    "planning.cancel": {
      "functionName": "PlanningService.cancelPlan",
      "filePath": "apps/api/src/transport/planning/planning.service.ts"
    },
    "planning.commit": {
      "filePath": "apps/api/src/transport/planning/planning.service.ts"
    },
    "planning.depot": {
      "functionName": "PlanningService.buildProposal",
      "filePath": "apps/api/src/transport/planning/planning.service.ts",
      "line": 637
    },
    "planning.grouping": {
      "functionName": "PlanningService.buildProposal",
      "filePath": "apps/api/src/transport/planning/planning.service.ts",
      "line": 667
    },
    "planning.preview": {
      "functionName": "PlanningService.preview",
      "filePath": "apps/api/src/transport/planning/planning.service.ts",
      "line": 192
    },
    "planning.run_closure": {
      "functionName": "PlanningService.settleRunClosure",
      "filePath": "apps/api/src/transport/planning/planning.service.ts"
    },
    "planning.run_closure_sweep": {
      "functionName": "RunClosureService.sweep",
      "filePath": "apps/api/src/transport/planning/run-closure.service.ts",
      "line": 201
    },
    "price.current_period": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 44
    },
    "price_period.activate": {
      "functionName": "PricePeriodsService.activate",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 524
    },
    "price_period.archive": {
      "functionName": "PricePeriodsService.archive",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 544
    },
    "price_period.copy": {
      "functionName": "PricePeriodsService.copyDraft",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 296
    },
    "price_period.create": {
      "functionName": "PricePeriodsService.createDraft",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 267
    },
    "price_period.import.apply": {
      "functionName": "PricePeriodsService.applyImport",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 358
    },
    "price_period.price.remove": {
      "functionName": "PricePeriodsService.removeDraftPrice",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 397
    },
    "profile.update": {
      "functionName": "AuthService.updateProfile",
      "filePath": "apps/api/src/auth/auth.service.ts"
    },
    "proof.challenge": {
      "filePath": "apps/api/src/transport/proof/operational-proof.service.ts"
    },
    "proof.withdraw": {
      "functionName": "OperationalProofService.withdraw",
      "filePath": "apps/api/src/transport/proof/operational-proof.service.ts"
    },
    "rules.policy": {
      "functionName": "grantsFromDealerPolicy",
      "filePath": "apps/api/src/outbound/outbound-authority.ts",
      "line": 227
    },
    "rules.pricing": {
      "functionName": "grantsFromPricedOrder",
      "filePath": "apps/api/src/outbound/outbound-authority.ts"
    },
    "rules.quote": {
      "functionName": "grantsFromQuote",
      "filePath": "apps/api/src/outbound/outbound-authority.ts",
      "line": 222
    },
    "run.assignment_change": {
      "functionName": "MovementService.assignRun",
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "run.cancel": {
      "functionName": "MovementService.cancelRun",
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "run.leg_cancel": {
      "functionName": "MovementService.cancelLeg",
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "run.leg_change": {
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "run.leg_transition": {
      "functionName": "MovementService.transitionLeg",
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "run.lifecycle_transition": {
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "run.trip_projection": {
      "functionName": "MovementService.projectTrip",
      "filePath": "apps/api/src/transport/movement/movement.service.ts"
    },
    "site_intake.confirm": {
      "filePath": "apps/api/src/transport/site-intake/site-intake.service.ts"
    },
    "site_intake.propose": {
      "filePath": "apps/api/src/transport/site-intake/site-intake.service.ts"
    },
    "source_truth.dealer.upsert": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 279
    },
    "source_truth.glossary.upsert": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 332
    },
    "source_truth.group.map": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 297
    },
    "source_truth.price.update": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 315
    },
    "stakeholder.account_link": {
      "functionName": "AssetOwnershipService.setStakeholderAccount",
      "filePath": "apps/api/src/transport/asset-ownership/asset-ownership.service.ts",
      "line": 171
    },
    "telematics.ingress": {
      "functionName": "TelematicsIngressService.ingest",
      "filePath": "apps/api/src/transport/proof/telematics/telematics-ingress.service.ts",
      "line": 93
    },
    "tenant.loaded": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 42
    },
    "toll_candidate.classify": {
      "functionName": "TollService.commitImport",
      "filePath": "apps/api/src/transport/toll/toll.service.ts",
      "line": 271
    },
    "toll_import.commit": {
      "filePath": "apps/api/src/transport/toll/toll.service.ts"
    },
    "toll_import.row": {
      "functionName": "TollService.commitImport",
      "filePath": "apps/api/src/transport/toll/toll.service.ts",
      "line": 256
    },
    "toll_review.resolve": {
      "filePath": "apps/api/src/transport/toll/toll.service.ts"
    },
    "tracking.history_read": {
      "functionName": "TrackingService.trackForSession",
      "filePath": "apps/api/src/transport/proof/tracking.service.ts",
      "line": 498
    },
    "tracking.location_health": {
      "functionName": "LocationHealthService.forVehicle",
      "filePath": "apps/api/src/transport/proof/location-health.service.ts",
      "line": 107
    },
    "tracking.observation_ingest": {
      "filePath": "apps/api/src/transport/proof/tracking.service.ts"
    },
    "tracking.risk_assessed": {
      "functionName": "TrackingService.recordRisk",
      "filePath": "apps/api/src/transport/proof/tracking.service.ts",
      "line": 577
    },
    "tracking.session_close": {
      "functionName": "TrackingService.closeSession",
      "filePath": "apps/api/src/transport/proof/tracking.service.ts"
    },
    "tracking.session_open": {
      "filePath": "apps/api/src/transport/proof/tracking.service.ts"
    },
    "transport.alerts.read": {
      "functionName": "OperationalAlertsController.feed",
      "filePath": "apps/api/src/transport/asset-compliance/operational-alerts.controller.ts",
      "line": 24
    },
    "transport.asset_ownership.manage": {
      "filePath": "apps/api/src/transport/asset-ownership/asset-ownership.controller.ts"
    },
    "transport.asset_ownership.read": {
      "filePath": "apps/api/src/transport/asset-ownership/asset-ownership.controller.ts"
    },
    "transport.checkpoint.read": {
      "functionName": "CheckpointsController.timeline",
      "filePath": "apps/api/src/transport/checkpoint/checkpoints.controller.ts",
      "line": 42
    },
    "transport.checkpoint.record": {
      "functionName": "CheckpointsController.record",
      "filePath": "apps/api/src/transport/checkpoint/checkpoints.controller.ts",
      "line": 55
    },
    "transport.commercial_acceptance.decide": {
      "functionName": "CommercialAcceptanceController.decide",
      "filePath": "apps/api/src/transport/acceptance/commercial-acceptance.controller.ts",
      "line": 126
    },
    "transport.commercial_acceptance.read": {
      "filePath": "apps/api/src/transport/acceptance/commercial-acceptance.controller.ts"
    },
    "transport.compliance.document.manage": {
      "filePath": "apps/api/src/transport/asset-compliance/compliance.controller.ts"
    },
    "transport.compliance.document.read": {
      "filePath": "apps/api/src/transport/asset-compliance/compliance.controller.ts"
    },
    "transport.control_tower.read": {
      "functionName": "ControlTowerController.view",
      "filePath": "apps/api/src/transport/control-tower/control-tower.controller.ts",
      "line": 43
    },
    "transport.costing.driver_fund.adjust": {
      "functionName": "DriverFundController.adjust",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 83
    },
    "transport.costing.driver_fund.advance": {
      "functionName": "DriverFundController.advance",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 66
    },
    "transport.costing.driver_fund.read": {
      "functionName": "DriverFundController.statement",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 53
    },
    "transport.costing.driver_fund.return": {
      "functionName": "DriverFundController.returnCash",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 75
    },
    "transport.costing.expense.read": {
      "filePath": "apps/api/src/transport/costing/trip-expenses.controller.ts"
    },
    "transport.costing.expense.record": {
      "functionName": "TripExpensesController.record",
      "filePath": "apps/api/src/transport/costing/trip-expenses.controller.ts",
      "line": 66
    },
    "transport.costing.period.manage": {
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts"
    },
    "transport.costing.period.read": {
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts"
    },
    "transport.costing.period.reopen": {
      "functionName": "DriverFundController.reopenPeriod",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 124
    },
    "transport.customer.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.customer.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.customer_payment.allocate": {
      "functionName": "CustomerArController.allocatePayment",
      "filePath": "apps/api/src/transport/customer-ar/customer-ar.controller.ts",
      "line": 190
    },
    "transport.customer_payment.correct": {
      "functionName": "CustomerArController.releaseAllocation",
      "filePath": "apps/api/src/transport/customer-ar/customer-ar.controller.ts",
      "line": 213
    },
    "transport.customer_payment.read": {
      "functionName": "CustomerArController.payment",
      "filePath": "apps/api/src/transport/customer-ar/customer-ar.controller.ts",
      "line": 77
    },
    "transport.customer_payment.record": {
      "functionName": "CustomerArController.recordPayment",
      "filePath": "apps/api/src/transport/customer-ar/customer-ar.controller.ts",
      "line": 169
    },
    "transport.customer_reconciliation.confirm": {
      "filePath": "apps/api/src/transport/customer-ar/customer-ar.controller.ts"
    },
    "transport.customer_reconciliation.read": {
      "filePath": "apps/api/src/transport/customer-ar/customer-ar.controller.ts"
    },
    "transport.dispatch.suggest.read": {
      "functionName": "DispatchController.suggest",
      "filePath": "apps/api/src/transport/dispatch/dispatch.controller.ts",
      "line": 63
    },
    "transport.driver.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.driver.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.driver.self.document.record": {
      "filePath": "apps/api/src/transport/document/driver-documents.controller.ts"
    },
    "transport.driver.self.expense.claim.submit": {
      "filePath": "apps/api/src/transport/claims/driver-claims-self.controller.ts"
    },
    "transport.driver.self.fund.read": {
      "functionName": "DriverFundSelfController.statement",
      "filePath": "apps/api/src/transport/costing/driver-fund-self.controller.ts",
      "line": 34
    },
    "transport.driver.self.payslip.read": {
      "filePath": "apps/api/src/transport/workforce/driver-payslips.controller.ts"
    },
    "transport.driver.self.proof.record": {
      "filePath": "apps/api/src/transport/proof/driver-proof.controller.ts"
    },
    "transport.driver.self.receipt_handover.record": {
      "functionName": "DriverDocumentsController.handover",
      "filePath": "apps/api/src/transport/document/driver-documents.controller.ts",
      "line": 85
    },
    "transport.driver.self.settlement.read": {
      "functionName": "DriverSettlementSelfController.statement",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement-self.controller.ts",
      "line": 34
    },
    "transport.driver.self.site_intake.confirm": {
      "functionName": "DriverSiteIntakeController.confirm",
      "filePath": "apps/api/src/transport/site-intake/driver-site-intake.controller.ts",
      "line": 75
    },
    "transport.driver.self.site_intake.propose": {
      "filePath": "apps/api/src/transport/site-intake/driver-site-intake.controller.ts"
    },
    "transport.driver.self.tracking.report": {
      "functionName": "DriverTrackingController.report",
      "filePath": "apps/api/src/transport/proof/driver-tracking.controller.ts",
      "line": 100
    },
    "transport.driver.self.tracking.start": {
      "filePath": "apps/api/src/transport/proof/driver-tracking.controller.ts"
    },
    "transport.driver.self.tracking.stop": {
      "functionName": "DriverTrackingController.closeSession",
      "filePath": "apps/api/src/transport/proof/driver-tracking.controller.ts",
      "line": 137
    },
    "transport.driver.self.trip.read": {
      "filePath": "apps/api/src/transport/trips/driver-trips.controller.ts"
    },
    "transport.driver.self.trip.update": {
      "functionName": "DriverTripsController.updateStatus",
      "filePath": "apps/api/src/transport/trips/driver-trips.controller.ts",
      "line": 61
    },
    "transport.driver.self.waiting.start": {
      "filePath": "apps/api/src/transport/waiting/driver-waiting.controller.ts"
    },
    "transport.driver_settlement.cashout": {
      "functionName": "DriverSettlementController.recordCashout",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.controller.ts",
      "line": 77
    },
    "transport.driver_settlement.read": {
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.controller.ts"
    },
    "transport.driver_settlement.reverse": {
      "functionName": "DriverSettlementController.reverseCashout",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.controller.ts",
      "line": 111
    },
    "transport.expense.claim.read": {
      "filePath": "apps/api/src/transport/claims/claims.controller.ts"
    },
    "transport.expense.claim.review": {
      "filePath": "apps/api/src/transport/claims/claims.controller.ts"
    },
    "transport.expense.claim.submit": {
      "functionName": "ExpenseClaimsController.submit",
      "filePath": "apps/api/src/transport/claims/claims.controller.ts",
      "line": 59
    },
    "transport.fleet_status.read": {
      "filePath": "apps/api/src/transport/asset-compliance/fleet-status.controller.ts"
    },
    "transport.fuel.cost_attribution.record": {
      "filePath": "apps/api/src/transport/fuel/fuel-cost-attribution.controller.ts"
    },
    "transport.fuel.document.read": {
      "filePath": "apps/api/src/transport/fuel/fuel-document.controller.ts"
    },
    "transport.fuel.entry.verify": {
      "filePath": "apps/api/src/transport/fuel/fuel-entries.controller.ts"
    },
    "transport.fuel.reconciliation.close": {
      "functionName": "FuelReconciliationController.close",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts",
      "line": 123
    },
    "transport.fuel.reconciliation.match": {
      "functionName": "FuelReconciliationController.runMatching",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts",
      "line": 90
    },
    "transport.fuel.reconciliation.read": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts"
    },
    "transport.fuel.reconciliation.reopen": {
      "functionName": "FuelReconciliationController.reopen",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts",
      "line": 131
    },
    "transport.fuel.reconciliation.resolve": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts"
    },
    "transport.fuel.statement.import": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts"
    },
    "transport.fuel.station.manage": {
      "filePath": "apps/api/src/transport/fuel/fuel-station.controller.ts"
    },
    "transport.fuel.station.read": {
      "filePath": "apps/api/src/transport/fuel/fuel-station.controller.ts"
    },
    "transport.maintenance.plan.manage": {
      "filePath": "apps/api/src/transport/asset-compliance/maintenance.controller.ts"
    },
    "transport.maintenance.plan.read": {
      "filePath": "apps/api/src/transport/asset-compliance/maintenance.controller.ts"
    },
    "transport.maintenance.work_order.close": {
      "filePath": "apps/api/src/transport/asset-compliance/maintenance.controller.ts"
    },
    "transport.maintenance.work_order.open": {
      "functionName": "MaintenanceController.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/maintenance.controller.ts",
      "line": 117
    },
    "transport.operational_document.record": {
      "functionName": "DocumentsController.record",
      "filePath": "apps/api/src/transport/document/documents.controller.ts",
      "line": 79
    },
    "transport.order.read": {
      "filePath": "apps/api/src/transport/movement/orders.controller.ts"
    },
    "transport.partner.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.partner.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.payroll.period.manage": {
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts"
    },
    "transport.payroll.period.read": {
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts"
    },
    "transport.payroll.run": {
      "functionName": "PayrollController.runPayroll",
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts",
      "line": 97
    },
    "transport.payslip.approve": {
      "functionName": "PayrollController.approve",
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts",
      "line": 135
    },
    "transport.payslip.correct": {
      "functionName": "PayrollController.correct",
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts",
      "line": 153
    },
    "transport.payslip.pay": {
      "functionName": "PayrollController.pay",
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts",
      "line": 145
    },
    "transport.proof.read": {
      "functionName": "ProofReviewController.forTrip",
      "filePath": "apps/api/src/transport/proof/proof-review.controller.ts",
      "line": 81
    },
    "transport.proof.withdraw": {
      "functionName": "ProofReviewController.withdraw",
      "filePath": "apps/api/src/transport/proof/proof-review.controller.ts",
      "line": 89
    },
    "transport.receipt_handover.record": {
      "functionName": "DocumentsController.handover",
      "filePath": "apps/api/src/transport/document/documents.controller.ts",
      "line": 133
    },
    "transport.settlement.document.read": {
      "functionName": "SettlementReportsController.documentChain",
      "filePath": "apps/api/src/transport/settlement/settlement-reports.controller.ts",
      "line": 121
    },
    "transport.stakeholder.self.vehicle.read": {
      "filePath": "apps/api/src/transport/asset-ownership/stakeholder-vehicles.controller.ts"
    },
    "transport.telematics.observation.ingest": {
      "functionName": "TelematicsIngressController.ingest",
      "filePath": "apps/api/src/transport/proof/telematics/telematics-ingress.controller.ts",
      "line": 61
    },
    "transport.toll.account.manage": {
      "filePath": "apps/api/src/transport/toll/toll.controller.ts"
    },
    "transport.toll.account.read": {
      "filePath": "apps/api/src/transport/toll/toll.controller.ts"
    },
    "transport.toll.import": {
      "filePath": "apps/api/src/transport/toll/toll.controller.ts"
    },
    "transport.toll.review.read": {
      "filePath": "apps/api/src/transport/toll/toll.controller.ts"
    },
    "transport.toll.review.resolve": {
      "functionName": "TollController.review",
      "filePath": "apps/api/src/transport/toll/toll.controller.ts",
      "line": 236
    },
    "transport.tracking.read": {
      "filePath": "apps/api/src/transport/proof/tracking.controller.ts"
    },
    "transport.trip.assign": {
      "functionName": "TripsController.assign",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 80
    },
    "transport.trip.cancel": {
      "functionName": "TripsController.cancel",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 101
    },
    "transport.trip.create": {
      "functionName": "TripsController.plan",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 63
    },
    "transport.trip.read": {
      "filePath": "apps/api/src/transport/trips/trips.controller.ts"
    },
    "transport.trip.transition": {
      "functionName": "TripsController.transition",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 88
    },
    "transport.trip.update": {
      "functionName": "TripsController.update",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 72
    },
    "transport.vehicle.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.vehicle.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.waiting.close": {
      "functionName": "WaitingController.close",
      "filePath": "apps/api/src/transport/waiting/waiting.controller.ts",
      "line": 49
    },
    "transport.waiting.read": {
      "functionName": "WaitingController.listForRun",
      "filePath": "apps/api/src/transport/waiting/waiting.controller.ts",
      "line": 42
    },
    "transport.waiting_allowance.decide": {
      "functionName": "WaitingAllowanceController.decide",
      "filePath": "apps/api/src/transport/waiting/allowance.controller.ts",
      "line": 91
    },
    "transport.waiting_allowance.propose": {
      "filePath": "apps/api/src/transport/waiting/allowance.controller.ts"
    },
    "trip_expense.record": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 310
    },
    "waiting.close": {
      "filePath": "apps/api/src/transport/waiting/waiting.service.ts"
    },
    "waiting.start": {
      "filePath": "apps/api/src/transport/waiting/waiting.service.ts"
    },
    "waiting_allowance.decide": {
      "filePath": "apps/api/src/transport/waiting/allowance.service.ts"
    },
    "waiting_allowance.propose": {
      "functionName": "WaitingAllowanceService.propose",
      "filePath": "apps/api/src/transport/waiting/allowance.service.ts"
    }
  },
  "decisions": {
    "account.access|*": {
      "functionName": "AuthService.decide",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 734
    },
    "advice.auto_reply|*": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 527
    },
    "advice.auto_reply|ALLOWED": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 543
    },
    "advisor.compose|COMPOSED": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 305
    },
    "advisor.compose|COMPOSER_DISABLED": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 206
    },
    "advisor.compose|DETERMINISTIC_PATH_SUFFICIENT": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 215
    },
    "advisor.compose|LLM_RETURNED_NOTHING": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 297
    },
    "agent.tool_authorization|*": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 228
    },
    "alerts.operational_feed|OPERATIONAL_ALERTS_COMPILED": {
      "functionName": "OperationalAlertsService.feed",
      "filePath": "apps/api/src/transport/asset-compliance/operational-alerts.service.ts",
      "line": 147
    },
    "alerts.operational_feed|OPERATIONAL_ALERTS_SOURCE_UNAVAILABLE": {
      "functionName": "OperationalAlertsService.feed",
      "filePath": "apps/api/src/transport/asset-compliance/operational-alerts.service.ts",
      "line": 138
    },
    "channel.send|*": {
      "functionName": "OutboundChannelRouter.record",
      "filePath": "apps/api/src/channels/outbound-channel.router.ts",
      "line": 122
    },
    "checkpoint.record|*": {
      "filePath": "apps/api/src/transport/checkpoint/checkpoint.service.ts"
    },
    "commercial_acceptance.decide|*": {
      "filePath": "apps/api/src/transport/acceptance/acceptance.service.ts"
    },
    "commercial_acceptance.decide|ACCEPTANCE_REPLAYED": {
      "functionName": "CommercialAcceptanceService.decide",
      "filePath": "apps/api/src/transport/acceptance/acceptance.service.ts",
      "line": 152
    },
    "commission.select|*": {
      "functionName": "SettlementService.recogniseCommission",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 558
    },
    "commission.select|COMMISSION_RULE_AMBIGUOUS": {
      "functionName": "SettlementService.recogniseCommission",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 511
    },
    "commission.select|COMMISSION_RULE_NONE_APPLICABLE": {
      "functionName": "SettlementService.recogniseCommission",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 497
    },
    "commission.select|COMMISSION_TRIP_NOT_PARTNER_REFERRED": {
      "functionName": "SettlementService.recogniseCommission",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 440
    },
    "compliance.document_register|COMPLIANCE_DOCUMENT_REGISTERED": {
      "functionName": "AssetComplianceService.registerDocument",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 361
    },
    "compliance.document_register|COMPLIANCE_SUBJECT_SHAPE_INVALID": {
      "functionName": "AssetComplianceService.assertSubject",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts"
    },
    "compliance.document_register|COMPLIANCE_SUBJECT_UNKNOWN": {
      "functionName": "AssetComplianceService.assertSubject",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 328
    },
    "compliance.document_register|COMPLIANCE_VALIDITY_RANGE_INVALID": {
      "functionName": "AssetComplianceService.registerDocument",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 346
    },
    "conflict.resolution|*": {
      "functionName": "SourceRegistryService.resolveConflict",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 679
    },
    "conflict.resolution|CONFLICT_OPENED": {
      "functionName": "SourceRegistryService.openConflict",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 644
    },
    "control_tower.board_projection|BOARD_CHECKPOINT_COLUMNS_UNAVAILABLE": {
      "functionName": "ControlTowerReadService.view",
      "filePath": "apps/api/src/transport/control-tower/control-tower-read.service.ts",
      "line": 174
    },
    "control_tower.compile|CONTROL_TOWER_COMPILED": {
      "functionName": "ControlTowerReadService.view",
      "filePath": "apps/api/src/transport/control-tower/control-tower-read.service.ts",
      "line": 182
    },
    "control_tower.compile|CONTROL_TOWER_SOURCE_FAILED": {
      "filePath": "apps/api/src/transport/control-tower/control-tower-read.service.ts"
    },
    "control_tower.compile|CONTROL_TOWER_SOURCE_UNAVAILABLE": {
      "functionName": "ControlTowerReadService.view",
      "filePath": "apps/api/src/transport/control-tower/control-tower-read.service.ts",
      "line": 165
    },
    "conversation.resolve|*": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 470
    },
    "costing.reversal|*": {
      "functionName": "CostingService.denyReversal",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 613
    },
    "costing.reversal|REVERSAL_POSTED": {
      "functionName": "CostingService.reverseCorrelation",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 587
    },
    "counterparty.link|*": {
      "functionName": "CounterpartyService.denyLink",
      "filePath": "apps/api/src/transport/counterparty/counterparty.service.ts",
      "line": 195
    },
    "counterparty.link|LINK_CREATED": {
      "functionName": "CounterpartyService.link",
      "filePath": "apps/api/src/transport/counterparty/counterparty.service.ts",
      "line": 126
    },
    "counterparty.link|LINK_UNCHANGED": {
      "functionName": "CounterpartyService.link",
      "filePath": "apps/api/src/transport/counterparty/counterparty.service.ts",
      "line": 101
    },
    "counterparty.unlink|*": {
      "functionName": "CounterpartyService.unlink",
      "filePath": "apps/api/src/transport/counterparty/counterparty.service.ts",
      "line": 148
    },
    "dispatch.candidate_filter|*": {
      "functionName": "DispatchService.suggest",
      "filePath": "apps/api/src/transport/dispatch/dispatch.service.ts",
      "line": 321
    },
    "dispatch.commit|*": {
      "functionName": "DispatchService.commit",
      "filePath": "apps/api/src/transport/dispatch/dispatch.service.ts",
      "line": 441
    },
    "dispatch.commit|COMMIT_REVALIDATION_FAILED": {
      "functionName": "DispatchService.commit",
      "filePath": "apps/api/src/transport/dispatch/dispatch.service.ts",
      "line": 422
    },
    "dispatch.pickup_resolution|*": {
      "functionName": "DispatchService.resolvePickup",
      "filePath": "apps/api/src/transport/dispatch/dispatch.service.ts",
      "line": 500
    },
    "dispatch.route_estimate|*": {
      "functionName": "DispatchService.routeGroupToPickup",
      "filePath": "apps/api/src/transport/dispatch/dispatch.service.ts",
      "line": 701
    },
    "dispatch.run_grouping|RUN_GROUPING_MULTI_ORDER_RUN": {
      "functionName": "DispatchService.requireMultiOrderRun",
      "filePath": "apps/api/src/transport/dispatch/dispatch.service.ts",
      "line": 256
    },
    "dispatch.run_grouping|RUN_GROUPING_ONE_ORDER_PER_RUN": {
      "functionName": "DispatchService.requireMultiOrderRun",
      "filePath": "apps/api/src/transport/dispatch/dispatch.service.ts",
      "line": 266
    },
    "driver.account_link|*": {
      "functionName": "DriverAccountLinkService.decide",
      "filePath": "apps/api/src/transport/fleet/driver-account-link.service.ts",
      "line": 155
    },
    "driver.self_expense_scope|*": {
      "functionName": "CostingReadService.selfTripExpenseEvidence",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 155
    },
    "driver.self_expense_scope|SELF_EXPENSE_SCOPE_NO_EVIDENCE": {
      "functionName": "CostingReadService.selfTripExpenseEvidence",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 172
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_GRANTED": {
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts"
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_NOT_OWNED": {
      "functionName": "FuelReadService.getMyFuelSlip",
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts",
      "line": 352
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "FuelReadService.requireDriverBinding",
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts",
      "line": 481
    },
    "driver.self_fund_scope|SELF_FUND_SCOPE_GRANTED": {
      "functionName": "CostingReadService.selfFundStatement",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 95
    },
    "driver.self_fund_scope|SELF_FUND_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "CostingReadService.selfFundStatement",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 81
    },
    "driver.self_payslip_scope|*": {
      "functionName": "WorkforceReadService.notVisible",
      "filePath": "apps/api/src/transport/workforce/workforce-read.service.ts",
      "line": 179
    },
    "driver.self_payslip_scope|SELF_PAYSLIP_DRAFT_WITHHELD": {
      "functionName": "WorkforceReadService.listMyPayslips",
      "filePath": "apps/api/src/transport/workforce/workforce-read.service.ts",
      "line": 98
    },
    "driver.self_payslip_scope|SELF_PAYSLIP_SCOPE_GRANTED": {
      "filePath": "apps/api/src/transport/workforce/workforce-read.service.ts"
    },
    "driver.self_payslip_scope|SELF_PAYSLIP_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "WorkforceReadService.requireDriverBinding",
      "filePath": "apps/api/src/transport/workforce/workforce-read.service.ts",
      "line": 201
    },
    "driver.self_scope|SELF_SCOPE_GRANTED": {
      "functionName": "TripService.listDriverTrips",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 338
    },
    "driver.self_scope|SELF_SCOPE_NOT_ASSIGNED": {
      "filePath": "apps/api/src/transport/trips/trip.service.ts"
    },
    "driver.self_scope|SELF_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "TripService.requireDriverBinding",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 474
    },
    "driver_fund.post_entry|FUND_ENTRY_IDEMPOTENT_REPLAY": {
      "functionName": "CostingService.postEntryDetailed",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 208
    },
    "driver_fund.post_entry|FUND_ENTRY_POSTED": {
      "functionName": "CostingService.postEntryDetailed",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 235
    },
    "driver_fund.run_expense|*": {
      "functionName": "RunExpenseService.deny",
      "filePath": "apps/api/src/transport/costing/run-expense.service.ts",
      "line": 271
    },
    "driver_fund.run_expense|RUN_EXPENSE_IDEMPOTENT_REPLAY": {
      "functionName": "RunExpenseService.replayOf",
      "filePath": "apps/api/src/transport/costing/run-expense.service.ts",
      "line": 251
    },
    "driver_fund.run_expense|RUN_EXPENSE_KEY_REUSED": {
      "functionName": "RunExpenseService.replayOf",
      "filePath": "apps/api/src/transport/costing/run-expense.service.ts",
      "line": 234
    },
    "driver_fund.run_expense|RUN_EXPENSE_PERIOD_FROZEN": {
      "functionName": "RunExpenseService.denyFrozen",
      "filePath": "apps/api/src/transport/costing/run-expense.service.ts",
      "line": 285
    },
    "driver_fund.run_expense|RUN_EXPENSE_RECORDED": {
      "functionName": "RunExpenseService.recordRunExpense",
      "filePath": "apps/api/src/transport/costing/run-expense.service.ts",
      "line": 184
    },
    "driver_settlement.cashout_post|*": {
      "functionName": "DriverSettlementService.denyPost",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.service.ts",
      "line": 372
    },
    "driver_settlement.cashout_post|CASHOUT_IDEMPOTENT_REPLAY": {
      "functionName": "DriverSettlementService.assertSameCashout",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.service.ts",
      "line": 344
    },
    "driver_settlement.cashout_post|CASHOUT_POSTED": {
      "functionName": "DriverSettlementService.recordCashout",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.service.ts",
      "line": 190
    },
    "driver_settlement.cashout_reverse|*": {
      "functionName": "DriverSettlementService.denyReverse",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.service.ts",
      "line": 382
    },
    "driver_settlement.cashout_reverse|CASHOUT_REVERSED": {
      "functionName": "DriverSettlementService.reverseCashout",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.service.ts",
      "line": 301
    },
    "driver_settlement.reimbursement_post|*": {
      "functionName": "DriverSettlementService.recordCashout",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.service.ts",
      "line": 144
    },
    "driver_settlement.reimbursement_post|REIMBURSEMENT_FUND_ENTRY_REVERSED": {
      "functionName": "DriverSettlementService.reverseCashout",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement.service.ts",
      "line": 257
    },
    "driver_settlement.self_statement|SELF_DRIVER_PROFILE_MISSING": {
      "functionName": "DriverSettlementReadService.selfStatement",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement-read.service.ts",
      "line": 172
    },
    "driver_settlement.self_statement|SELF_SETTLEMENT_SERVED": {
      "functionName": "DriverSettlementReadService.selfStatement",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement-read.service.ts",
      "line": 186
    },
    "driver_settlement.wage_window|*": {
      "functionName": "DriverSettlementReadService.statement",
      "filePath": "apps/api/src/transport/driver-settlement/driver-settlement-read.service.ts",
      "line": 145
    },
    "evidence.read|EVIDENCE_LOCATOR_OUT_OF_SCOPE": {
      "functionName": "TransportEvidenceService.read",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 118
    },
    "evidence.read|EVIDENCE_OBJECT_MISSING": {
      "functionName": "TransportEvidenceService.read",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 135
    },
    "evidence.read|EVIDENCE_SERVED": {
      "functionName": "TransportEvidenceService.read",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 145
    },
    "evidence.remove|EVIDENCE_LOCATOR_OUT_OF_SCOPE": {
      "functionName": "TransportEvidenceService.remove",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 178
    },
    "evidence.remove|EVIDENCE_PURGED": {
      "functionName": "TransportEvidenceService.remove",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 203
    },
    "evidence.remove|EVIDENCE_PURGE_UNSUPPORTED": {
      "functionName": "TransportEvidenceService.remove",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 192
    },
    "evidence.upload|*": {
      "functionName": "TransportEvidenceService.put",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 71
    },
    "evidence.upload|EVIDENCE_STORED": {
      "functionName": "TransportEvidenceService.put",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 99
    },
    "evidence.upload|EVIDENCE_STORE_DISABLED": {
      "functionName": "TransportEvidenceService.put",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 83
    },
    "fact.supersession|*": {
      "functionName": "SourceRegistryService.supersedeFact",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 514
    },
    "fact.transition|*": {
      "functionName": "SourceRegistryService.transitionFact",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 573
    },
    "fact.usability|*": {
      "functionName": "SourceReadinessService.canUseFact",
      "filePath": "apps/api/src/source-registry/source-readiness.service.ts"
    },
    "fact.usability|FACT_AMBIGUOUS_LIVE_VERSIONS": {
      "functionName": "SourceReadinessService.getEffectiveFact",
      "filePath": "apps/api/src/source-registry/source-readiness.service.ts",
      "line": 65
    },
    "fact.usability|FACT_NOT_APPROVED": {
      "functionName": "SourceReadinessService.canUseFact",
      "filePath": "apps/api/src/source-registry/source-readiness.service.ts",
      "line": 131
    },
    "file.activate|FILE_ACTIVATED": {
      "functionName": "FileService.activate",
      "filePath": "apps/api/src/files/file.service.ts",
      "line": 262
    },
    "file.link|FILE_LINKED": {
      "functionName": "FileService.createLink",
      "filePath": "apps/api/src/files/file.service.ts",
      "line": 545
    },
    "file.link|FILE_LINK_ALREADY_ACTIVE": {
      "functionName": "FileService.createLink",
      "filePath": "apps/api/src/files/file.service.ts"
    },
    "file.orphan|*": {
      "functionName": "FilePurgeService.scanOrphans",
      "filePath": "apps/api/src/files/file-purge.service.ts",
      "line": 265
    },
    "file.purge|*": {
      "functionName": "FilePurgeService.decide",
      "filePath": "apps/api/src/files/file-purge.service.ts",
      "line": 285
    },
    "file.quarantine|FILE_SCAN_CLEAN": {
      "functionName": "FileService.runScanGate",
      "filePath": "apps/api/src/files/file.service.ts",
      "line": 217
    },
    "file.read|FILE_SERVED": {
      "functionName": "FileService.read",
      "filePath": "apps/api/src/files/file.service.ts",
      "line": 331
    },
    "file.stage|FILE_STAGED": {
      "functionName": "FileService.stage",
      "filePath": "apps/api/src/files/file.service.ts",
      "line": 171
    },
    "file.withdraw|FILE_WITHDRAWN": {
      "functionName": "FileService.withdraw",
      "filePath": "apps/api/src/files/file.service.ts",
      "line": 658
    },
    "finance.margin|FINANCE_MARGIN_COMPILED": {
      "functionName": "FinanceReadService.margin",
      "filePath": "apps/api/src/transport/finance/finance-read.service.ts",
      "line": 123
    },
    "finance.summary|FINANCE_CURRENCY_MIXED": {
      "functionName": "FinanceReadService.summary",
      "filePath": "apps/api/src/transport/finance/finance-read.service.ts",
      "line": 79
    },
    "finance.summary|FINANCE_SOURCE_FAILED": {
      "functionName": "FinanceReadService.readDriverBalances",
      "filePath": "apps/api/src/transport/finance/finance-read.service.ts",
      "line": 170
    },
    "finance.summary|FINANCE_SOURCE_UNAVAILABLE": {
      "functionName": "FinanceReadService.summary",
      "filePath": "apps/api/src/transport/finance/finance-read.service.ts",
      "line": 89
    },
    "finance.summary|FINANCE_SUMMARY_COMPILED": {
      "functionName": "FinanceReadService.summary",
      "filePath": "apps/api/src/transport/finance/finance-read.service.ts",
      "line": 98
    },
    "fleet.effective_vehicle_state|*": {
      "functionName": "AssetComplianceReadService.emitStateDecision",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance-read.service.ts",
      "line": 237
    },
    "fleet.effective_vehicle_state|VEHICLE_MAINTENANCE_TRIP_CONFLICT": {
      "functionName": "AssetComplianceReadService.emitStateDecision",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance-read.service.ts",
      "line": 246
    },
    "fuel.cost_attribution|*": {
      "functionName": "FuelCostAttributionService.deny",
      "filePath": "apps/api/src/transport/fuel/fuel-cost-attribution.service.ts",
      "line": 305
    },
    "fuel.cost_attribution|FUEL_COST_ATTRIBUTED": {
      "functionName": "FuelCostAttributionService.attribute",
      "filePath": "apps/api/src/transport/fuel/fuel-cost-attribution.service.ts",
      "line": 127
    },
    "fuel.cost_attribution|FUEL_COST_ATTRIBUTION_ALREADY_REVERSED": {
      "functionName": "FuelCostAttributionService.reverse",
      "filePath": "apps/api/src/transport/fuel/fuel-cost-attribution.service.ts",
      "line": 174
    },
    "fuel.cost_attribution|FUEL_COST_ATTRIBUTION_KEY_REUSED": {
      "functionName": "FuelCostAttributionService.replayOf",
      "filePath": "apps/api/src/transport/fuel/fuel-cost-attribution.service.ts",
      "line": 263
    },
    "fuel.cost_attribution|FUEL_COST_ATTRIBUTION_REPLAY": {
      "functionName": "FuelCostAttributionService.replayOf",
      "filePath": "apps/api/src/transport/fuel/fuel-cost-attribution.service.ts",
      "line": 276
    },
    "fuel.cost_attribution|FUEL_COST_ATTRIBUTION_REVERSED": {
      "functionName": "FuelCostAttributionService.reverse",
      "filePath": "apps/api/src/transport/fuel/fuel-cost-attribution.service.ts",
      "line": 185
    },
    "fuel.cost_attribution|FUEL_COST_ATTRIBUTION_TARGET_NOT_FOUND": {
      "functionName": "FuelCostAttributionService.denyTargetNotFound",
      "filePath": "apps/api/src/transport/fuel/fuel-cost-attribution.service.ts",
      "line": 287
    },
    "fuel.cost_posting|*": {
      "functionName": "FuelService.postFuelCost",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 808
    },
    "fuel.cost_posting|FUEL_COST_ALREADY_POSTED": {
      "functionName": "FuelService.postFuelCost",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 782
    },
    "fuel.cost_posting|FUEL_COST_AWAITS_ATTRIBUTION": {
      "functionName": "FuelService.postFuelCost",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 771
    },
    "fuel.driver_cash_posting|*": {
      "functionName": "FuelService.postRunFirstDriverCash",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 869
    },
    "fuel.driver_cash_posting|FUEL_DRIVER_CASH_ALREADY_POSTED": {
      "functionName": "FuelService.postRunFirstDriverCash",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 839
    },
    "fuel.match|*": {
      "functionName": "FuelReconciliationService.runMatching",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts"
    },
    "fuel.match|MATCH_PAYMENT_METHOD_CONFLICT": {
      "functionName": "FuelReconciliationService.denyCashPaidMatch",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 740
    },
    "fuel.match|MATCH_SELF_SOURCED_BLOCKED": {
      "functionName": "FuelReconciliationService.buildConfirmedMatch",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 853
    },
    "fuel.settlement_handoff|*": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 595
    },
    "fuel_discrepancy.resolve|DISCREPANCY_ALREADY_RESOLVED": {
      "functionName": "FuelReconciliationService.resolveDiscrepancy",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 318
    },
    "fuel_discrepancy.resolve|DISCREPANCY_CASH_PAID_NOT_PAYABLE": {
      "functionName": "FuelReconciliationService.resolveDiscrepancy",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 339
    },
    "fuel_discrepancy.resolve|DISCREPANCY_MATCH_TARGET_REQUIRED": {
      "functionName": "FuelReconciliationService.buildConfirmedMatch",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 812
    },
    "fuel_discrepancy.resolve|DISCREPANCY_RESOLVED": {
      "functionName": "FuelReconciliationService.resolveDiscrepancy",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 399
    },
    "fuel_discrepancy.revise|*": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts"
    },
    "fuel_entry.amend|*": {
      "functionName": "FuelService.denyAmend",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 1205
    },
    "fuel_entry.amend|FUEL_ENTRY_AMENDED": {
      "functionName": "FuelService.amendFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 618
    },
    "fuel_entry.amend|FUEL_ENTRY_AMEND_STATE_RACE": {
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts"
    },
    "fuel_entry.evidence_withdraw|*": {
      "functionName": "FuelService.denyEvidenceWithdrawal",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 512
    },
    "fuel_entry.evidence_withdraw|FUEL_EVIDENCE_ALREADY_WITHDRAWN": {
      "functionName": "FuelService.withdrawEvidence",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 455
    },
    "fuel_entry.evidence_withdraw|FUEL_EVIDENCE_NOT_FOUND": {
      "functionName": "FuelService.withdrawEvidence",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 442
    },
    "fuel_entry.evidence_withdraw|FUEL_EVIDENCE_WITHDRAWN": {
      "functionName": "FuelService.withdrawEvidence",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 492
    },
    "fuel_entry.review|*": {
      "functionName": "FuelService.denyReview",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 1228
    },
    "fuel_entry.review|FUEL_ENTRY_REJECTED": {
      "functionName": "FuelService.rejectFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 711
    },
    "fuel_entry.review|FUEL_ENTRY_REVIEW_REOPENED": {
      "functionName": "FuelService.resubmitFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 740
    },
    "fuel_entry.review|FUEL_ENTRY_VERIFIED": {
      "functionName": "FuelService.verifyFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 681
    },
    "fuel_entry.submit|*": {
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts"
    },
    "fuel_entry.submit|FUEL_CORRELATION_KEY_REUSED": {
      "functionName": "FuelService.assertSameEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 1252
    },
    "fuel_entry.submit|FUEL_ENTRY_DRIVER_NOT_ASSIGNED": {
      "functionName": "FuelService.requireAssignedToTrip",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 962
    },
    "fuel_entry.submit|FUEL_ENTRY_IDEMPOTENT_REPLAY": {
      "functionName": "FuelService.replayOf",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 1084
    },
    "fuel_entry.submit|FUEL_ENTRY_RECORDED": {
      "functionName": "FuelService.submitFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 291
    },
    "fuel_entry.submit|FUEL_ENTRY_VEHICLE_NOT_ASSIGNED": {
      "functionName": "FuelService.requireAssignedToTrip",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 976
    },
    "fuel_handoff.drain|*": {
      "functionName": "FuelHandoffDrainService.report",
      "filePath": "apps/api/src/transport/settlement/fuel-handoff-drain.service.ts",
      "line": 473
    },
    "fuel_reconciliation.transition|*": {
      "functionName": "FuelReconciliationService.denyFrozen",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 674
    },
    "fuel_reconciliation.transition|RECONCILIATION_CLOSED": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 588
    },
    "fuel_reconciliation.transition|RECONCILIATION_FROZEN": {
      "functionName": "FuelReconciliationService.requireOpen",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 783
    },
    "fuel_reconciliation.transition|RECONCILIATION_HAS_CASH_PAID_MATCH": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 553
    },
    "fuel_reconciliation.transition|RECONCILIATION_HAS_PENDING_DISCREPANCY": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 540
    },
    "fuel_reconciliation.transition|RECONCILIATION_MATCHING_RUN": {
      "functionName": "FuelReconciliationService.runMatching",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 261
    },
    "fuel_reconciliation.transition|RECONCILIATION_REOPENED": {
      "functionName": "FuelReconciliationService.reopenReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 636
    },
    "fuel_reconciliation.transition|RECONCILIATION_RESOLVED": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts"
    },
    "fuel_reconciliation.transition|RECONCILIATION_TRANSITION_NOT_PERMITTED": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts"
    },
    "fuel_statement.import_row|*": {
      "functionName": "FuelStatementService.commitImport",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 174
    },
    "fuel_statement.import|STATEMENT_EMPTY": {
      "functionName": "FuelStatementService.buildPreview",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 221
    },
    "fuel_statement.import|STATEMENT_IMPORTED": {
      "functionName": "FuelStatementService.commitImport",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 158
    },
    "fuel_statement.import|STATEMENT_MAPPING_INVALID": {
      "functionName": "FuelStatementService.buildPreview",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 205
    },
    "fuel_statement.import|STATEMENT_PERIOD_TAKEN": {
      "functionName": "FuelStatementService.commitImport",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 106
    },
    "fund_period.transition|*": {
      "filePath": "apps/api/src/transport/costing/fund-period.service.ts"
    },
    "fund_period.transition|PERIOD_CLOSED": {
      "functionName": "FundPeriodService.closePeriod",
      "filePath": "apps/api/src/transport/costing/fund-period.service.ts",
      "line": 162
    },
    "fund_period.transition|PERIOD_OPENED": {
      "functionName": "FundPeriodService.openPeriod",
      "filePath": "apps/api/src/transport/costing/fund-period.service.ts",
      "line": 84
    },
    "ledger.record|*": {
      "filePath": "apps/api/src/decision-ledger/decision-ledger.service.ts"
    },
    "maintenance.work_order_close|MAINTENANCE_ODO_REGRESSION": {
      "functionName": "AssetComplianceService.completeWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 202
    },
    "maintenance.work_order_close|MAINTENANCE_WORK_ORDER_CANCELLED": {
      "functionName": "AssetComplianceService.cancelWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 271
    },
    "maintenance.work_order_close|MAINTENANCE_WORK_ORDER_COMPLETED": {
      "functionName": "AssetComplianceService.completeWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 240
    },
    "maintenance.work_order_close|MAINTENANCE_WORK_ORDER_NOT_OPEN": {
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts"
    },
    "maintenance.work_order_open|MAINTENANCE_PLAN_UNKNOWN": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 124
    },
    "maintenance.work_order_open|MAINTENANCE_PLAN_VEHICLE_MISMATCH": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 150
    },
    "maintenance.work_order_open|MAINTENANCE_VEHICLE_UNKNOWN": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 108
    },
    "maintenance.work_order_open|MAINTENANCE_WORK_ORDER_ALREADY_OPEN": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 166
    },
    "maintenance.work_order_open|MAINTENANCE_WORK_ORDER_OPENED": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 179
    },
    "message.intake|ACCEPTED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 227
    },
    "message.intake|DUPLICATE_MESSAGE": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 199
    },
    "message.intake|GROUP_NOT_MAPPED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 218
    },
    "message.intake|PARTICIPANT_IGNORED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 185
    },
    "order.auto_confirm|*": {
      "functionName": "SalesOrderOutcomeService.settle",
      "filePath": "apps/api/src/orders/sales-order-outcome.service.ts",
      "line": 42
    },
    "order.auto_confirm|ALLOWED": {
      "functionName": "SalesOrderOutcomeService.settle",
      "filePath": "apps/api/src/orders/sales-order-outcome.service.ts",
      "line": 71
    },
    "order.handoff_followup_mark|*": {
      "functionName": "SalesHandoffFollowupService.decided",
      "filePath": "apps/api/src/orders/sales-handoff-followup.service.ts",
      "line": 131
    },
    "order.handoff_followup_schedule|*": {
      "functionName": "OrdersService.decideSchedule",
      "filePath": "apps/api/src/orders/orders.service.ts",
      "line": 225
    },
    "order.location|*": {
      "functionName": "MovementService.requireOrderPoint",
      "filePath": "apps/api/src/transport/movement/movement.service.ts",
      "line": 1052
    },
    "outbound.authority|*": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 413
    },
    "outbound.send_guard|*": {
      "functionName": "TurnReplyService.performSendAdviceReply",
      "filePath": "apps/api/src/turns/turn-reply.service.ts",
      "line": 88
    },
    "outbound.send_guard|COMPOSITION_EVIDENCE_STALE": {
      "functionName": "TurnReplyService.performSendAdviceReply",
      "filePath": "apps/api/src/turns/turn-reply.service.ts",
      "line": 113
    },
    "ownership.scope.resolve|*": {
      "functionName": "AssetOwnershipScopeService.decide",
      "filePath": "apps/api/src/transport/asset-ownership/asset-ownership-scope.service.ts",
      "line": 146
    },
    "payroll.driver_fund_disclosure|DRIVER_FUND_NOT_AVAILABLE": {
      "functionName": "WorkforceService.emitFundDisclosure",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 266
    },
    "payroll.driver_fund_disclosure|DRIVER_FUND_SHOWN_WITHOUT_DEDUCTION": {
      "functionName": "WorkforceService.emitFundDisclosure",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 275
    },
    "payroll.run|PAYROLL_INPUT_UNAVAILABLE": {
      "functionName": "WorkforceService.runPayroll",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 205
    },
    "payroll.run|PAYROLL_PERIOD_CLOSED": {
      "functionName": "WorkforceService.runPayroll",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 230
    },
    "payroll.run|PAYROLL_PERIOD_UNKNOWN": {
      "functionName": "WorkforceService.runPayroll",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 137
    },
    "payroll.run|PAYROLL_RUN_COMPLETED": {
      "functionName": "WorkforceService.runPayroll",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 243
    },
    "payslip.correction|*": {
      "functionName": "WorkforceService.issueCorrection",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 465
    },
    "payslip.correction|PAYSLIP_ALREADY_REVERSED": {
      "functionName": "WorkforceService.issueCorrection",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 452
    },
    "payslip.correction|PAYSLIP_NOT_CORRECTABLE": {
      "functionName": "WorkforceService.issueCorrection",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 372
    },
    "payslip.transition|*": {
      "functionName": "WorkforceService.movePayslip",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts"
    },
    "payslip.transition|PAYSLIP_TRANSITION_NOT_PERMITTED": {
      "functionName": "WorkforceService.movePayslip",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 319
    },
    "place.lookup|*": {
      "functionName": "TransportPlaceService.recordLookup",
      "filePath": "apps/api/src/transport/places/place.service.ts",
      "line": 114
    },
    "place.write|*": {
      "functionName": "PlaceAdminService.decide",
      "filePath": "apps/api/src/transport/places/admin/place-admin.service.ts",
      "line": 676
    },
    "proof.challenge|CHALLENGE_ABSENT_OFFLINE_PATH": {
      "functionName": "OperationalProofService.record",
      "filePath": "apps/api/src/transport/proof/operational-proof.service.ts",
      "line": 216
    },
    "proof.record|PROOF_PHOTO_NOT_LIVE_CAMERA": {
      "functionName": "OperationalProofService.record",
      "filePath": "apps/api/src/transport/proof/operational-proof.service.ts",
      "line": 237
    },
    "receipt_handover.record|*": {
      "filePath": "apps/api/src/transport/document/handover.service.ts"
    },
    "rules.dealer_price|*": {
      "functionName": "AgentOrchestrator.dispatch",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 881
    },
    "rules.price|*": {
      "functionName": "AgentOrchestrator.dispatch",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 905
    },
    "settlement.allocate|*": {
      "functionName": "SettlementService.allocate",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 847
    },
    "settlement.correct|*": {
      "functionName": "SettlementService.ingestFuelHandoff",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 674
    },
    "settlement.correct|ADJUSTMENT_POSTED": {
      "functionName": "SettlementService.adjustDocument",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 750
    },
    "settlement.correct|CORRECTION_NO_CHANGE": {
      "functionName": "SettlementService.adjustDocument",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 710
    },
    "settlement.correct|REVERSAL_POSTED": {
      "functionName": "SettlementService.reverseDocument",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 805
    },
    "settlement.credit_check|*": {
      "functionName": "SettlementService.creditExposure",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 888
    },
    "settlement.recognise|*": {
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts"
    },
    "settlement.recognise|SETTLEMENT_TRIP_NOT_RECONCILED": {
      "functionName": "SettlementService.recogniseCustomerReceivable",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 290
    },
    "settlement.recognise|SETTLEMENT_TRIP_REVENUE_MISSING": {
      "functionName": "SettlementService.recogniseCustomerReceivable",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 304
    },
    "settlement_period.transition|*": {
      "functionName": "SettlementService.transitionPeriod",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 970
    },
    "settlement_period.transition|PERIOD_OPENED": {
      "functionName": "SettlementService.openPeriod",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 953
    },
    "source.approval|*": {
      "filePath": "apps/api/src/source-registry/source-registry.service.ts"
    },
    "source.supersession|*": {
      "functionName": "SourceRegistryService.supersedeSource",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 270
    },
    "source.transition|*": {
      "functionName": "SourceRegistryService.transitionSource",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 329
    },
    "stakeholder.account_link|*": {
      "functionName": "AssetOwnershipService.decideLink",
      "filePath": "apps/api/src/transport/asset-ownership/asset-ownership.service.ts",
      "line": 236
    },
    "supervisor.risk|*": {
      "functionName": "AgentOrchestrator.run",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 763
    },
    "telematics.ingress|*": {
      "filePath": "apps/api/src/transport/proof/telematics/telematics-ingress.service.ts"
    },
    "toll_account.link|*": {
      "functionName": "TollAccountService.decide",
      "filePath": "apps/api/src/transport/toll/toll-account.service.ts",
      "line": 311
    },
    "tracking.location_health|*": {
      "functionName": "LocationHealthService.compute",
      "filePath": "apps/api/src/transport/proof/location-health.service.ts",
      "line": 175
    },
    "tracking.risk_assessed|*": {
      "functionName": "TrackingService.recordRisk",
      "filePath": "apps/api/src/transport/proof/tracking.service.ts",
      "line": 592
    },
    "trip.assignment_change|*": {
      "functionName": "TripService.assign",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 198
    },
    "trip.assignment_change|ASSIGNMENT_TRIP_TERMINAL": {
      "functionName": "TripService.assign",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 163
    },
    "trip.assignment_change|ASSIGNMENT_UNCHANGED": {
      "functionName": "TripService.assign",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 186
    },
    "trip.cancel|*": {
      "functionName": "TripService.cancel",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 286
    },
    "trip.cancel|CANCEL_RECORDED": {
      "functionName": "TripService.cancel",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 302
    },
    "trip.lifecycle_transition|*": {
      "functionName": "TripService.transition",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 233
    },
    "trip_expense.record|*": {
      "functionName": "CostingService.guardTripAcceptsExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 694
    },
    "trip_expense.record|EXPENSE_DRIVER_NOT_ASSIGNED": {
      "functionName": "CostingService.requireDriverAssignedToTrip",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 780
    },
    "trip_expense.record|EXPENSE_IDEMPOTENT_REPLAY": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 300
    },
    "trip_expense.record|EXPENSE_RECORDED": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 341
    }
  }
};
