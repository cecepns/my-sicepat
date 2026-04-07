export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api-inventory.isavralabel.com/my-sicepat/api'

export const ENDPOINTS = {
  login: '/auth/login',
  settings: '/settings',
  offices: '/offices',
  users: '/users',
  customers: '/customers',
  attendance: '/attendance',
  attendanceCheckIn: '/attendance/check-in',
  attendanceCheckOut: '/attendance/check-out',
  attendanceAdminMark: '/attendance/admin-mark',
  attendanceLeave: '/attendance/leave',
  attendanceLatePointsMe: '/attendance/late-points/me',
  attendanceLatePointsSummary: '/attendance/late-points/summary',
  attendanceLatePointsResetMonth: '/attendance/late-points/reset-month',
  tasks: '/tasks',
  taskStart: '/tasks',
  taskClaim: '/tasks',
  userWorkStatus: '/users/work-status',
  selectUsers: '/select/users',
}
