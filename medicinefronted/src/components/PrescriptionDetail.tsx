import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { api } from '../api/client'
import type { Prescription } from '../api/types'
import { age, dateTime, genderNames, money, paymentNames } from '../lib/format'
import { useAction } from '../lib/hooks'
import { Brand, Button, DataState, Field, Modal, Notice, StatusBadge } from './ui'

export function PrescriptionContent({ prescription: rx }: { prescription: Prescription }) {
  return (
    <div className="prescription-document">
      <div className="rx-document-header">
        <Brand compact />
        <div>
          <h3>门诊处方笺</h3>
          <p>OUTPATIENT PRESCRIPTION</p>
        </div>
        <StatusBadge status={rx.status} />
      </div>
      <div className="rx-document-number">
        <span>{rx.prescription_no}</span>
        <span>{dateTime(rx.created_at)}</span>
      </div>
      <div className="rx-patient-grid">
        <div>
          <small>患者姓名</small>
          <strong>{rx.patient_name}</strong>
        </div>
        <div>
          <small>性别 / 年龄</small>
          <strong>
            {genderNames[rx.gender]} / {age(rx.birth_date)}岁
          </strong>
        </div>
        <div>
          <small>就诊科室</small>
          <strong>{rx.department_name}</strong>
        </div>
        <div>
          <small>接诊医生</small>
          <strong>{rx.doctor_name}</strong>
        </div>
      </div>
      <div className="rx-diagnosis">
        <small>临床诊断</small>
        <strong>{rx.diagnosis}</strong>
        {rx.diagnosis_code && <code>{rx.diagnosis_code}</code>}
      </div>
      {rx.chief_complaint && (
        <div className="rx-complaint">
          <small>主诉</small>
          <p>{rx.chief_complaint}</p>
        </div>
      )}
      {rx.allergies && !rx.allergies.startsWith('无') && (
        <Notice tone="warning">过敏信息：{rx.allergies}</Notice>
      )}
      <div className="rx-symbol">
        ℞ <span>处方明细</span>
      </div>
      <div className="rx-items">
        {rx.items.map((item, index) => (
          <div key={item.id} className="rx-item">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h4>
                {item.drug_name}
                <small>{item.specification}</small>
              </h4>
              <p>
                {item.dosage} · {item.frequency}
              </p>
            </div>
            <div className="rx-item-amount">
              <strong>{money(item.line_total_cents)}</strong>
              <small>
                {item.quantity} {item.unit} × {money(item.unit_price_cents)}
              </small>
            </div>
          </div>
        ))}
      </div>
      <div className="rx-total">
        <span>处方费用合计</span>
        <strong>{money(rx.total_amount_cents)}</strong>
      </div>
      {rx.notes && (
        <div className="rx-note">
          <small>医嘱备注</small>
          <p>{rx.notes}</p>
        </div>
      )}
      {rx.charge && (
        <div className="rx-payment-info">
          <span>
            {rx.charge.status === 'refunded' ? '已退费' : '已收款'} ·{' '}
            {paymentNames[rx.charge.payment_method]} · {rx.charge.cashier_name}
          </span>
          <small>
            {rx.charge.charge_no} / {dateTime(rx.charge.paid_at)}
          </small>
          {rx.charge.status === 'refunded' && <small>退费原因：{rx.charge.refund_reason}</small>}
        </div>
      )}
      {rx.dispensation && (
        <div className="rx-payment-info">
          <span>发药药师：{rx.dispensation.pharmacist_name}</span>
          <small>
            {rx.dispensation.dispense_no} / {dateTime(rx.dispensation.created_at)}
          </small>
        </div>
      )}
    </div>
  )
}

export function PrescriptionModal({
  id,
  onClose,
  canVoid = false,
}: {
  id: number
  onClose: () => void
  canVoid?: boolean
}) {
  const query = useQuery({
    queryKey: ['prescription', id],
    queryFn: () => api.get<Prescription>(`/prescriptions/${id}`),
  })
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const action = useAction(() => api.post(`/prescriptions/${id}/void`, { reason }), '处方已作废')
  return (
    <Modal
      title={voiding ? '作废未收费处方' : '处方详情'}
      wide
      onClose={onClose}
      busy={action.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          {query.data && !voiding && (
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={15} />
              打印处方
            </Button>
          )}
          {canVoid &&
            query.data?.status === 'unpaid' &&
            (voiding ? (
              <Button
                variant="danger"
                disabled={reason.trim().length < 2}
                loading={action.isPending}
                onClick={() => action.mutate(undefined, { onSuccess: onClose })}
              >
                确认作废
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setVoiding(true)}>
                作废处方
              </Button>
            ))}
        </>
      }
    >
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {query.data && <PrescriptionContent prescription={query.data} />}
      </DataState>
      {voiding && (
        <Field label="作废原因" required>
          <textarea
            autoFocus
            required
            rows={3}
            minLength={2}
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="请记录作废原因，本次就诊将关闭"
          />
        </Field>
      )}
      {action.error && <Notice tone="warning">{action.error.message}</Notice>}
    </Modal>
  )
}
