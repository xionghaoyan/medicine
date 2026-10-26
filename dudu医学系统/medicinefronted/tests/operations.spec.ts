import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Drug, Page as ApiPage, Prescription, Registration, Schedule } from '../src/api/types'
import { businessDate, shiftDate } from '../src/lib/format'

async function login(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '体验管理员', exact: true }).click()
  await page.getByRole('button', { name: '登录工作台', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
}

async function post<T>(page: Page, path: string, data: unknown): Promise<T> {
  const response = await page.request.post('/api/v1' + path, {
    data,
    headers: { 'X-Requested-With': 'his-web' },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

async function stock(page: Page, code: string): Promise<Drug> {
  const response = await page.request.get('/api/v1/drugs', { params: { q: code } })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as ApiPage<Drug>).items[0]
}

async function visit(page: Page) {
  const patient = await post<{ id: number }>(page, '/patients', {
    full_name: '界面验证' + Date.now().toString().slice(-7),
    gender: 'female',
    birth_date: '1994-06-10',
    phone: '13900006666',
    allergies: '无已知过敏',
  })
  const response = await page.request.get('/api/v1/schedules', {
    params: { date: businessDate(), doctor_id: 1 },
  })
  const schedule = ((await response.json()) as Schedule[]).find((item) => item.remaining_slots > 0)!
  const registration = await post<Registration>(page, '/registrations', {
    patient_id: patient.id,
    schedule_id: schedule.id,
  })
  return { registration, schedule }
}

test('收费预留、退费释放、退号恢复号源，处方可独立打印', async ({ page }) => {
  await login(page)
  const { registration } = await visit(page)
  const drug = await stock(page, 'MED001')
  const prescription = await post<Prescription>(page, '/prescriptions', {
    registration_id: registration.id,
    diagnosis: '仅用于流程验证的虚构诊断',
    chief_complaint: '浏览器退费验证',
    items: [{ drug_id: drug.id, quantity: 2, dosage: '仅用于教学', frequency: '遵医嘱' }],
  })
  await page
    .getByRole('navigation', { name: '业务导航' })
    .getByRole('link', { name: '收费结算' })
    .click()
  await page
    .getByRole('textbox', { name: '搜索患者姓名、处方编号…' })
    .fill(prescription.prescription_no)
  await page
    .getByRole('row')
    .filter({ hasText: prescription.prescription_no })
    .getByRole('button', { name: '确认收款' })
    .click()
  const charge = page.getByRole('dialog', { name: '核对处方并确认收款' })
  await charge.getByRole('checkbox').check()
  await charge.getByRole('button', { name: '确认已收款' }).click()
  await expect(charge).toBeHidden()
  const reserved = await stock(page, drug.drug_code)
  expect(reserved.total_stock).toBe(drug.total_stock)
  expect(reserved.reserved_stock).toBe(drug.reserved_stock + 2)
  expect(reserved.available_stock).toBe(drug.available_stock - 2)
  await page.getByRole('tab', { name: '已缴费', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: prescription.prescription_no })
  await row.getByRole('button', { name: '明细' }).click()
  const detail = page.getByRole('dialog', { name: '处方详情', exact: true })
  await expect(detail.locator('.prescription-document')).toContainText(prescription.prescription_no)
  await page.emulateMedia({ media: 'print' })
  await expect(detail.locator('.prescription-document')).toBeVisible()
  await expect(page.locator('#root')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
  await detail.getByRole('button', { name: '关闭弹窗' }).click()
  await row.getByRole('button', { name: '退费', exact: true }).click()
  const refund = page.getByRole('dialog', { name: '处方退费', exact: true })
  await expect(refund.getByRole('button', { name: '确认退费' })).toBeDisabled()
  await refund.getByLabel('退费原因').fill('演示退费，尚未发药')
  await refund.getByRole('button', { name: '确认退费' }).click()
  await expect(refund).toBeHidden()
  const released = await stock(page, drug.drug_code)
  expect(released.available_stock).toBe(drug.available_stock)
  expect(released.reserved_stock).toBe(drug.reserved_stock)
  expect(released.total_stock).toBe(drug.total_stock)
  await page.getByRole('tab', { name: '已退费', exact: true }).click()
  await expect(row).toContainText('已退费')

  const second = await visit(page)
  await page
    .getByRole('navigation', { name: '业务导航' })
    .getByRole('link', { name: '门诊挂号' })
    .click()
  await page
    .getByRole('textbox', { name: '搜索姓名、编号…' })
    .fill(second.registration.registration_no)
  await page
    .getByRole('row')
    .filter({ hasText: second.registration.registration_no })
    .getByRole('button', { name: '退号', exact: true })
    .click()
  const cancellation = page.getByRole('dialog')
  await cancellation.getByRole('button', { name: '确认退号' }).click()
  await expect(cancellation).toBeHidden()
  await expect(
    page.getByRole('row').filter({ hasText: second.registration.registration_no }),
  ).toContainText('已取消')
  const schedules: Schedule[] = await (
    await page.request.get('/api/v1/schedules', { params: { date: businessDate(), doctor_id: 1 } })
  ).json()
  expect(schedules.find((item) => item.id === second.schedule.id)!.remaining_slots).toBe(
    second.schedule.remaining_slots,
  )
})

test('CSV 显示成功与错误行，批次入库增加真实库存', async ({ page }, testInfo) => {
  await login(page)
  await page
    .getByRole('navigation', { name: '主导航', exact: true })
    .getByRole('button', { name: '药房中心' })
    .click()
  await page
    .getByRole('navigation', { name: '业务导航' })
    .getByRole('link', { name: '药品库存' })
    .click()
  await page.getByRole('button', { name: '批量导入', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '药品批量导入' })
  const code = 'UITEST' + Date.now()
  const expiry = shiftDate(businessDate(), 400)
  const csv = [
    'drug_code,generic_name,trade_name,specification,dosage_form,unit,price_cents,insurance_category,manufacturer,stock_threshold,batch_no,quantity,expires_at',
    [
      code,
      '界面测试示例药',
      '',
      '10mg×10片',
      '片剂',
      '盒',
      2890,
      'self',
      '虚构药厂',
      5,
      'UI001',
      20,
      expiry,
    ].join(','),
    [
      code + 'BAD',
      '非法数量示例药',
      '',
      '10mg×10片',
      '片剂',
      '盒',
      2890,
      'self',
      '虚构药厂',
      5,
      'UI002',
      -2,
      expiry,
    ].join(','),
  ].join('\n')
  await modal
    .getByLabel('选择药品 CSV 文件')
    .setInputFiles({ name: 'dudu-demo.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  const imported = page.waitForResponse(
    (response) =>
      response.url().endsWith('/drugs/import') && response.request().method() === 'POST',
  )
  await modal.getByRole('button', { name: '开始导入' }).click()
  expect(await (await imported).json()).toMatchObject({
    success_count: 1,
    failed_count: 1,
    skipped_count: 0,
  })
  await expect(modal).toContainText('第 3 行')
  await expect(modal).toContainText('导入处理完成')
  await page.screenshot({ path: testInfo.outputPath('import-result.png'), fullPage: true })
  await modal.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索药品名称、商品名、编码…' }).fill(code)
  const row = page.getByRole('row').filter({ hasText: code })
  await expect(row).toContainText('¥28.90')
  await row.getByRole('button', { name: '入库', exact: true }).click()
  const receive = page.getByRole('dialog', { name: '药品批次入库' })
  await receive.getByLabel('生产批号').fill('UI003')
  await receive.getByLabel('入库数量（盒）').fill('7')
  await receive.getByLabel('有效期至').fill(expiry)
  await receive.getByRole('button', { name: '确认入库' }).click()
  await expect(receive).toBeHidden()
  const updated = await stock(page, code)
  expect(updated.available_stock).toBe(27)
  expect(updated.total_stock).toBe(27)
  expect(updated.price_cents).toBe(2890)
  await expect(row).toContainText('27')
  await row.getByRole('button', { name: '批次', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('UI003')
})

test('全局搜索、使用帮助与提醒可导航到对应业务', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true })
  await login(page)
  await page.getByRole('button', { name: '搜索患者或药品' }).click()
  const search = page.getByRole('dialog', { name: '搜索工作空间' })
  await search.getByLabel('全局搜索').fill('江予安')
  await search.getByRole('button', { name: /江予安/ }).click()
  await expect(page.getByRole('heading', { name: '患者档案', exact: true })).toBeVisible()
  await expect(page.locator('tbody')).toContainText('江予安')
  await page.getByRole('button', { name: '使用帮助', exact: true }).click()
  const help = page.getByRole('dialog', { name: '一起完成一次门诊' })
  await expect(help).toContainText('核对并发药')
  await help.getByRole('button', { name: '我知道了' }).click()
  await expect(help).toBeHidden()
  await page.getByRole('button', { name: '消息与待办' }).click()
  const notices = page.getByRole('dialog', { name: '消息与待办' })
  await notices.getByRole('button', { name: /氯雷他定片 库存偏低/ }).click()
  await expect(page.getByRole('heading', { name: '药品库存', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '库存预警' })).toHaveAttribute('aria-selected', 'true')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '展开导航' }).click()
  await page
    .getByRole('navigation', { name: '移动导航' })
    .getByRole('link', { name: '工作台', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '移动导航' })).toHaveCount(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('mobile-dashboard.png'), fullPage: true })
})
