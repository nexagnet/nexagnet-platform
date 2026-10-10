import { EXPERIENCE_REQUIREMENTS, type CapabilityId, type ExperienceId } from '@netviet/tenant';
import type { ComponentType } from 'react';
import { AgentWorkforce } from './agent-workforce/AgentWorkforce';
import { B2bSalesOperations } from './b2b-sales-operations/B2bSalesOperations';
import { KnowledgeWorkspace } from './knowledge-workspace/KnowledgeWorkspace';
import { LegalOffice } from './legal-office/LegalOffice';
import { OperationsConsole } from './operations-console/OperationsConsole';
import { TransportOperations } from './transport-operations/TransportOperations';

export interface ExperienceDefinition {
  readonly id: ExperienceId;
  readonly requiredCapabilities: readonly CapabilityId[];
  readonly Component: ComponentType;
}

export const EXPERIENCE_REGISTRY = {
  'operations-console': {
    id: 'operations-console',
    requiredCapabilities: EXPERIENCE_REQUIREMENTS['operations-console'],
    Component: OperationsConsole,
  },
  'knowledge-workspace': {
    id: 'knowledge-workspace',
    requiredCapabilities: EXPERIENCE_REQUIREMENTS['knowledge-workspace'],
    Component: KnowledgeWorkspace,
  },
  'agent-workforce': {
    id: 'agent-workforce',
    requiredCapabilities: EXPERIENCE_REQUIREMENTS['agent-workforce'],
    Component: AgentWorkforce,
  },
  'transport-operations': {
    id: 'transport-operations',
    requiredCapabilities: EXPERIENCE_REQUIREMENTS['transport-operations'],
    Component: TransportOperations,
  },
  'b2b-sales-operations': {
    id: 'b2b-sales-operations',
    requiredCapabilities: EXPERIENCE_REQUIREMENTS['b2b-sales-operations'],
    Component: B2bSalesOperations,
  },
  'legal-office': {
    id: 'legal-office',
    requiredCapabilities: EXPERIENCE_REQUIREMENTS['legal-office'],
    Component: LegalOffice,
  },
} as const satisfies Record<ExperienceId, ExperienceDefinition>;

export function resolveExperience(id: ExperienceId): ExperienceDefinition {
  const definition = (EXPERIENCE_REGISTRY as Partial<Record<string, ExperienceDefinition>>)[id];
  if (!definition) throw new Error(`Experience khong duoc web ho tro: ${id}`);
  return definition;
}
