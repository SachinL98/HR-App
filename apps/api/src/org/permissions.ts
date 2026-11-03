export const PERMISSIONS = {
  'leave.approve': 'Approve leave requests',
  'wfh.approve': 'Approve work-from-home requests',
  'quota.manage': 'Set leave and WFH quotas',
  'holiday.manage': 'Manage company holidays',
  'notice.publish': 'Publish notices',
  'member.invite': 'Invite members',
  'member.manage': 'Edit and deactivate members',
  'department.manage': 'Manage departments',
  'role.manage': 'Manage company roles',
  'permission.grant': 'Grant permissions to others',
  'payroll.manage': 'Set up and run payroll',
  'payroll.view': 'View payroll',
  'document.template.manage': 'Manage document templates',
  'document.issue': 'Issue documents with stamp and signature',
  'document.request.approve': 'Approve document requests',
  'meeting.manage_all': 'Edit any meeting',
  'integration.manage': 'Manage integrations',
  'billing.manage': 'Manage subscription and billing',
  'audit.view': 'View the audit log',
  'branding.manage': 'Edit company profile and theme',
} as const;

export type PermissionAction = keyof typeof PERMISSIONS;
export const isPermission = (a: string): a is PermissionAction =>
  a in PERMISSIONS;

export interface Grant {
  action: string;
  scopeType: 'COMPANY' | 'DEPARTMENT' | 'MEMBER';
  scopeIds: string[];
}

export interface Subject {
  isOwner: boolean;
  departmentId: string | null;
  roleDefaults: string[];
  grants: Grant[];
}

/** Target of an action: a department and/or a specific member. Omit for company-wide actions. */
export interface Target {
  departmentId?: string | null;
  memberId?: string;
}

/**
 * Owners can do everything. Otherwise an action is allowed when the member's role
 * defaults include it (company-wide) or a grant covers the target's scope.
 * With no target, only company-wide access counts.
 */
export function can(
  s: Subject,
  action: PermissionAction,
  target?: Target,
): boolean {
  if (s.isOwner) return true;
  if (s.roleDefaults.includes(action)) return true;
  return s.grants.some((g) => {
    if (g.action !== action) return false;
    if (g.scopeType === 'COMPANY') return true;
    if (!target) return false;
    if (g.scopeType === 'DEPARTMENT')
      return !!target.departmentId && g.scopeIds.includes(target.departmentId);
    return !!target.memberId && g.scopeIds.includes(target.memberId);
  });
}

export const PLAN_LIMITS = {
  FREE: { seats: 5 },
  BRONZE: { seats: 25 },
  SILVER: { seats: 100 },
  GOLD: { seats: 500 },
  PLATINUM: { seats: Infinity },
} as const;
