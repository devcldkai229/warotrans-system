import { afterEach, describe, expect, it } from 'vitest'
import { setLanguageForTests } from '@/shared/i18n'
import { localizedNotificationText } from './notificationText'

afterEach(() => setLanguageForTests('en'))

const say = (title: string, content: string) => localizedNotificationText({ title, content })

describe('localizedNotificationText', () => {
  it('returns what was stored when the language is English', () => {
    expect(say('Robot RBT-002 went offline', 'No heartbeat from the robot.')).toEqual({
      title: 'Robot RBT-002 went offline',
      content: 'No heartbeat from the robot.',
    })
  })

  it('says a robot notification in Vietnamese with the robot taken out of the stored sentence', () => {
    setLanguageForTests('vi')

    expect(say('Robot RBT-002 went offline', 'No heartbeat from the robot. A job it was running may need to be reassigned.')).toEqual({
      title: 'Robot RBT-002 đã mất kết nối',
      content: 'Không nhận được nhịp tim từ robot. Công việc robot đang chạy có thể cần được giao lại.',
    })
    expect(say('Robot RBT-001 battery is low', '18% left and the robot is not charging.')).toEqual({
      title: 'Pin của robot RBT-001 đang yếu',
      content: 'Còn 18% pin và robot không đang sạc.',
    })
  })

  it('keeps the failure reason a Job carries, with or without one', () => {
    setLanguageForTests('vi')

    expect(say('Job JOB-20261101-000003 failed', 'The job stopped and will not continue. Reason: ROBOT_TIMEOUT.')).toEqual({
      title: 'Công việc JOB-20261101-000003 thất bại',
      content: 'Công việc đã dừng và sẽ không tiếp tục. Lý do: ROBOT_TIMEOUT.',
    })
    expect(say('Job J-1 is paused', 'A step failed and the workflow waits for an operator to resume it.').content).toBe(
      'Một bước đã thất bại và quy trình đang chờ người vận hành cho chạy tiếp.',
    )
  })

  it('words a known failure code in the reason, in English too, and leaves an unknown code alone', () => {
    const content = (reason: string) => say('Job J-1 needs another robot', `The robot could not finish the job; assign it to a different robot. Reason: ${reason}.`).content

    expect(content('check_failed_battery_min')).toBe('The robot could not finish the job; assign it to a different robot. Reason: The battery is too low.')
    setLanguageForTests('vi')
    expect(content('check_failed_battery_min')).toBe('Robot không hoàn thành được công việc; hãy giao cho robot khác. Lý do: Pin quá yếu.')
    expect(content('MYSTERY_CODE')).toBe('Robot không hoàn thành được công việc; hãy giao cho robot khác. Lý do: MYSTERY_CODE.')
  })

  it('translates how long something has waited, in all three of the backend forms', () => {
    setLanguageForTests('vi')
    const waiting = (waited: string) => say('Job J-9 has not been started', `It has been waiting ${waited} for a robot. Run it on a robot from its job page.`).content

    expect(waiting('12 min')).toBe('Công việc đã chờ robot 12 phút. Hãy chạy nó trên một robot từ trang công việc.')
    expect(waiting('3 h 05 min')).toBe('Công việc đã chờ robot 3 giờ 05 phút. Hãy chạy nó trên một robot từ trang công việc.')
    expect(waiting('8 days')).toBe('Công việc đã chờ robot 8 ngày. Hãy chạy nó trên một robot từ trang công việc.')
  })

  it('handles the step name in quotes, a request, and an issue with its severity', () => {
    setLanguageForTests('vi')

    expect(say('Job J-2 is waiting for a person', 'The step "Confirm pickup" needs someone to confirm it and has waited 4 min.').content).toBe(
      'Bước "Confirm pickup" cần có người xác nhận và đã chờ 4 phút.',
    )
    expect(say('Transport request REQ-7 has failed containers', '1 of 3 container(s) failed, 2 delivered.')).toEqual({
      title: 'Yêu cầu vận chuyển REQ-7 có container thất bại',
      content: '1 trên 3 container thất bại, 2 đã giao.',
    })
    expect(say('Issue ISS-ABC reported (HIGH)', 'Lidar cover loose').title).toBe('Sự cố ISS-ABC được báo cáo (Cao)')
  })

  it('leaves text it does not recognise as stored, including what a person wrote', () => {
    setLanguageForTests('vi')

    expect(say('Something nobody wrote a template for', 'Lidar cover loose')).toEqual({
      title: 'Something nobody wrote a template for',
      content: 'Lidar cover loose',
    })
    // A cancellation reason is typed by an operator: the label is translated, their words are not.
    expect(say('Transport request REQ-7 was cancelled', 'Reason: customer changed the order').content).toBe('Lý do: customer changed the order')
  })
})
