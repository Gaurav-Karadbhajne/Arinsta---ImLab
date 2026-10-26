// ============================================================
// GLOBAL TOAST PANEL  --  <app-toast />
// ------------------------------------------------------------
// Rendered ONCE in the shell (app.component), so it floats
// top-right over every screen. Reads the shared ToastService
// and draws whatever toasts exist. You never talk to this
// component directly -- use ToastService.ok/err/info instead.
// ============================================================
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toast', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.toasts().length) {
      <div class="wrap">
        @for (t of svc.toasts(); track t.id) {
          <div class="t {{ t.kind }}" role="status">
            <span class="dot"></span>
            <span class="txt">{{ t.text }}</span>
            <button type="button" class="x" (click)="svc.dismiss(t.id)" aria-label="Close">×</button>
          </div>
        }
      </div>
    }`,
  styles: [`
    /* fixed top-right, above everything (z-index 100), doesn't move the page */
    .wrap{position:fixed;top:74px;right:18px;z-index:100;display:flex;flex-direction:column;gap:10px;width:min(360px,90vw);pointer-events:none}
    .t{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--card);border:1px solid var(--line);
        border-left:4px solid var(--teal);border-radius:12px;box-shadow:var(--sh-lg);pointer-events:auto;
        animation:tin .22s cubic-bezier(.2,.9,.3,1.2)}
    .dot{width:9px;height:9px;border-radius:50%;background:var(--teal);flex:none}
    .txt{flex:1;font-size:13px;font-weight:600;color:var(--ink);line-height:1.4}
    .x{border:0;background:none;color:var(--mut);font-size:18px;line-height:1;cursor:pointer;padding:0 2px}
    .x:hover{color:var(--ink)}
    /* red for errors */
    .t.err{border-left-color:#C0392B}
    .t.err .dot{background:#C0392B}
    /* blue for neutral info */
    .t.info{border-left-color:#2F6FBA}
    .t.info .dot{background:#2F6FBA}
    @keyframes tin{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
  `]
})
export class ToastComponent {
  // Pull the shared service in so the template can read toasts() and call dismiss().
  svc = inject(ToastService);
}