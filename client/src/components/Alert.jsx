// A coloured message box. type: "error" | "success" | "info"
// role="alert" makes screen readers announce errors as soon as they appear.
export default function Alert({ type = 'info', children }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
