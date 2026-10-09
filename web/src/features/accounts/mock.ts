import type { Account } from '@/shared/api/contracts'

export const ACCOUNTS: Account[] = [
  {
    id: 'acc-0001',
    username: 'thang.ho',
    email: 'thang.ho@warotrans.com',
    fullName: 'Ho Sy Thang',
    role: 'ADMIN',
    status: 'ACTIVE',
    lastLoginAt: '2026-09-20T09:12:00+07:00',
  },
  {
    id: 'acc-0002',
    username: 'linh.tran',
    email: 'linh.tran@warotrans.com',
    fullName: 'Tran Thi Linh',
    role: 'STAFF',
    status: 'ACTIVE',
    lastLoginAt: '2026-09-19T16:40:00+07:00',
  },
  {
    id: 'acc-0003',
    username: 'minh.nguyen',
    email: 'minh.nguyen@warotrans.com',
    fullName: 'Nguyen Van Minh',
    role: 'STAFF',
    status: 'ACTIVE',
    lastLoginAt: '2026-09-18T08:05:00+07:00',
  },
  {
    id: 'acc-0004',
    username: 'huy.pham',
    email: 'huy.pham@warotrans.com',
    fullName: 'Pham Gia Huy',
    role: 'STAFF',
    status: 'LOCKED',
    lastLoginAt: '2026-08-30T14:22:00+07:00',
  },
  {
    id: 'acc-0005',
    username: 'anh.le',
    email: 'anh.le@warotrans.com',
    fullName: 'Le Thuy Anh',
    role: 'ADMIN',
    status: 'ACTIVE',
    lastLoginAt: '2026-09-20T07:58:00+07:00',
  },
]
