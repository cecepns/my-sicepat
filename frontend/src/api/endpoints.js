export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api-inventory.isavralabel.com/my-sicepat/api'

export const ENDPOINTS = {
  login: '/auth/login',
  settings: '/settings',
  users: '/users',
  attendance: '/attendance',
  attendanceCheckIn: '/attendance/check-in',
  attendanceCheckOut: '/attendance/check-out',
  attendanceAdminMark: '/attendance/admin-mark',
  tasks: '/tasks',
  taskStart: '/tasks',
  taskClaim: '/tasks',
  userWorkStatus: '/users/work-status',
  selectUsers: '/select/users',
}
