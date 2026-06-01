import type { ReactNode } from 'react'

export interface FormRowProps {
  label: string
  children: ReactNode
  title?: string
}

/** 连接对话框中的标签 + 控件行布局 */
export default function FormRow({ label, children, title }: FormRowProps) {
  return (
    <div className="form-row">
      <label className="form-label" title={title}>{label}</label>
      <div className="form-control">{children}</div>
    </div>
  )
}
