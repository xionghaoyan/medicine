import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function login(page: Page, account = 'admin') {
  await page.goto('/')
  await page.getByLabel('工作账号').fill(account)
  await page.getByLabel('登录密码').fill('DuduDemo2026!')
  await page.getByRole('button', { name: '登录工作台' }).click()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  await expect(page.locator('.stat-card').first()).toBeVisible()
}

async function switchRole(page: Page, account: string) {
  await page.getByRole('button', { name: '安全退出' }).click()
  await expect(page.getByRole('button', { name: '登录工作台' })).toBeVisible()
  await login(page, account)
}

test('不同角色完成建档、挂号、开方、收费、发药并留下审计记录', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const name = `流程患者${Date.now().toString().slice(-6)}`
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: '患者档案' }).click()
  await page.getByRole('button', { name: '新建患者', exact: true }).click()
  const patientForm = page.getByRole('dialog', { name: '新建患者档案' })
  await patientForm.getByLabel('患者姓名').fill(name)
  await patientForm.getByLabel('出生日期').fill('1995-05-10')
  await patientForm.getByLabel('联系电话').fill('13900009876')
  await patientForm.getByRole('button', { name: '建立档案' }).click()
  await expect(patientForm).toBeHidden()
  await page.getByRole('textbox', { name: '搜索姓名、患者编号、手机号…' }).fill(name)
  const patientRow = page.getByRole('row').filter({ hasText: name })
  await patientRow.getByRole('button', { name: '挂号', exact: true }).click()
  const registration = page.getByRole('dialog', { name: '新建门诊挂号' })
  await registration.getByRole('button', { name: /林知远.*上午/ }).click()
  await registration.getByRole('button', { name: '确认挂号' }).click()
  const receipt = page.getByRole('dialog', { name: '挂号凭证' })
  await expect(receipt).toContainText(name)
  await receipt.getByRole('button', { name: '关闭弹窗' }).click()

  await switchRole(page, 'doctor')
  await page.getByRole('navigation').getByRole('link', { name: '医生工作站' }).click()
  await page.getByRole('textbox', { name: '搜索候诊患者…' }).fill(name)
  await expect(page.locator('.consultation-patient')).toContainText(name)
  await page.getByRole('button', { name: '开始接诊', exact: true }).click()
  await expect(page.locator('.consultation-patient')).toContainText('就诊中')
  await page.getByLabel('患者主诉').fill('浏览器流程测试虚构主诉')
  await page.getByLabel('临床诊断').fill('教学测试诊断')
  await page.getByLabel('诊断编码').fill('J06.9')
  await page.getByRole('button', { name: '添加药品', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选择处方药品' })
  await picker.getByRole('button', { name: /阿莫西林胶囊/ }).click()
  await page.getByLabel('阿莫西林胶囊数量').fill('2')
  await page.getByLabel('阿莫西林胶囊用量').fill('自动化测试用量')
  await page.getByLabel('阿莫西林胶囊频次').selectOption('遵医嘱')
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/prescriptions') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '确认并开具处方' }).click()
  const rx = await (await createResponse).json()
  expect(rx.status).toBe('unpaid')
  expect(rx.total_amount_cents).toBe(2400)
  const prescription = page.getByRole('dialog')
  await expect(prescription).toContainText(rx.prescription_no)
  await prescription.getByRole('button', { name: '关闭弹窗' }).click()

  await switchRole(page, 'cashier')
  await page.getByRole('navigation').getByRole('link', { name: '收费结算' }).click()
  await page.getByRole('textbox', { name: '搜索患者姓名、处方编号…' }).fill(name)
  await page
    .getByRole('row')
    .filter({ hasText: name })
    .getByRole('button', { name: '确认收款' })
    .click()
  const payment = page.getByRole('dialog', { name: '核对处方并确认收款' })
  await expect(payment.getByRole('button', { name: '确认已收款' })).toBeDisabled()
  await expect(payment).toContainText('¥24.00')
  await payment.getByRole('button', { name: '现金', exact: true }).click()
  await payment.getByRole('checkbox').check()
  await payment.getByRole('button', { name: '确认已收款' }).click()
  await expect(payment).toBeHidden()
  await page.getByRole('tab', { name: '已缴费' }).click()
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('待发药')

  await switchRole(page, 'pharmacist')
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /药房发药/ })
    .click()
  await page.getByRole('textbox', { name: '搜索患者姓名、处方编号…' }).fill(name)
  await page
    .getByRole('row')
    .filter({ hasText: name })
    .getByRole('button', { name: '核对发药' })
    .click()
  const dispense = page.getByRole('dialog', { name: '处方核对与发药' })
  await expect(dispense).toContainText('预留批次核对')
  await expect(dispense.getByRole('button', { name: '确认发药' })).toBeDisabled()
  await dispense.getByRole('checkbox').check()
  await dispense.getByRole('button', { name: '确认发药' }).click()
  await expect(dispense).toBeHidden()
  await page.getByRole('tab', { name: '已发药' }).click()
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('已发药')

  await switchRole(page, 'admin')
  await page
    .getByRole('navigation', { name: '主导航', exact: true })
    .getByRole('button', { name: '运营管理' })
    .click()
  await page
    .getByRole('navigation', { name: '业务导航' })
    .getByRole('link', { name: '操作日志' })
    .click()
  await page.locator('.search-input input').fill(rx.prescription_no)
  await expect(page.locator('tbody')).toContainText('发药')
  expect(errors).toEqual([])
})

test('管理员工作区、库存筛选、报表导出和空状态可用', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page)
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
  const pages = [
    ['/patients', '患者档案'],
    ['/registrations', '门诊挂号'],
    ['/consultations', '医生工作站'],
    ['/schedules', '医生排班'],
    ['/billing', '收费结算'],
    ['/pharmacy', '药房发药'],
    ['/inventory', '药品库存'],
    ['/reports', '统计报表'],
    ['/audit', '操作日志'],
    ['/settings', '系统设置'],
  ]
  for (const [path, title] of pages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.locator('.loading-state')).toHaveCount(0)
    await expect(page.locator('.error-state')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(path.slice(1) + '.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            content: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
          })),
        { message: `${title}在窄屏中不应使整个页面横向滚动` },
      )
      .toEqual({ content: 390, viewport: 390 })
    await page.screenshot({
      path: testInfo.outputPath(path.slice(1) + '-mobile.png'),
      fullPage: true,
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  await page.goto('/inventory?filter=low')
  await expect(page.getByRole('tab', { name: '库存预警' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('tbody')).toContainText('氯雷他定片')
  await page.goto('/reports')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.csv$/)
  expect(await download.failure()).toBeNull()
  await page.goto('/patients?q=没有这位测试患者')
  await expect(page.getByText('暂无相关记录', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('医生无法访问财务工作区，退出后缓存与登录状态清除', async ({ page }) => {
  await login(page, 'doctor')
  await expect(page.getByRole('navigation').getByRole('link', { name: '收费结算' })).toHaveCount(0)
  await expect(page.getByText('今日实收净额', { exact: true })).toHaveCount(0)
  await page.goto('/billing')
  await expect(page.getByRole('heading', { name: '当前角色无权访问此工作区' })).toBeVisible()
  const response = await page.request.get('/api/v1/reports')
  expect(response.status()).toBe(403)
  await page.getByRole('button', { name: '安全退出' }).click()
  await expect(page.getByRole('button', { name: '登录工作台' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '登录工作台' })).toBeVisible()
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401)
})

test('窄屏导航、表格和键盘弹窗可正常使用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: '展开导航' }).click()
  await page
    .getByRole('navigation', { name: '移动导航' })
    .getByRole('link', { name: '患者档案' })
    .click()
  await expect(page.getByRole('heading', { name: '患者档案', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: '新建患者', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新建患者', exact: true })).toBeFocused()
  await page.goto('/inventory')
  await expect(page.getByRole('heading', { name: '药品库存', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
