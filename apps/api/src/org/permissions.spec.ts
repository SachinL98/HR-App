import { can, Subject } from './permissions';

const base: Subject = {
  isOwner: false,
  departmentId: 'd1',
  roleDefaults: [],
  grants: [],
};

describe('can()', () => {
  it('owner can do anything', () => {
    expect(can({ ...base, isOwner: true }, 'payroll.manage')).toBe(true);
  });
  it('plain member can do nothing', () => {
    expect(can(base, 'leave.approve', { departmentId: 'd1' })).toBe(false);
  });
  it('role defaults grant company-wide access', () => {
    expect(
      can({ ...base, roleDefaults: ['member.invite'] }, 'member.invite'),
    ).toBe(true);
  });
  it('department grant only covers that department', () => {
    const s: Subject = {
      ...base,
      grants: [
        { action: 'leave.approve', scopeType: 'DEPARTMENT', scopeIds: ['eng'] },
      ],
    };
    expect(can(s, 'leave.approve', { departmentId: 'eng' })).toBe(true);
    expect(can(s, 'leave.approve', { departmentId: 'hr' })).toBe(false);
    expect(can(s, 'leave.approve')).toBe(false);
  });
  it('member grant only covers that member', () => {
    const s: Subject = {
      ...base,
      grants: [
        { action: 'wfh.approve', scopeType: 'MEMBER', scopeIds: ['m1'] },
      ],
    };
    expect(can(s, 'wfh.approve', { memberId: 'm1' })).toBe(true);
    expect(can(s, 'wfh.approve', { memberId: 'm2' })).toBe(false);
  });
  it('company grant covers everything for that action only', () => {
    const s: Subject = {
      ...base,
      grants: [
        { action: 'notice.publish', scopeType: 'COMPANY', scopeIds: [] },
      ],
    };
    expect(can(s, 'notice.publish')).toBe(true);
    expect(can(s, 'payroll.manage')).toBe(false);
  });
});
