// ============================================================
// GLOBAL TOAST SERVICE  --  ImLab notification system
// ------------------------------------------------------------
// ONE small service drives notifications for the WHOLE app.
//
// HOW TO USE IN ANY SCREEN:
//   1) at the top of your component class add:
//        private notify = inject(ToastService);
//      (and make sure `inject` is imported from @angular/core)
//   2) anywhere you want to tell the user something:
//        this.notify.ok('Saved successfully');      // green tick
//        this.notify.err('Could not save.');        // red, stays longer
//        this.notify.info('Loading older records…');// blue neutral
//
// Toasts stack top-right, auto-dismiss after a few seconds,
// and can be closed with the little x.
// ============================================================
import { Injectable, signal } from '@angular/core';

// One toast on screen. 'kind' decides its colour.
export interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string }

@Injectable({ providedIn: 'root' })   // 'root' = one shared instance app-wide, no need to add to providers anywhere
export class ToastService {
  // Signal holding the currently-visible toasts (newest on top).
  toasts = signal<Toast[]>([]);
  private nextId = 1;                 // simple counter so every toast has a unique key/id

  // ---- public API: call these from any component ----

  ok(text: string)   { this.push('ok', text); }   // success (green)  - short-lived
  err(text: string)  { this.push('err', text); }  // error (red)      - stays longer
  info(text: string) { this.push('info', text); } // neutral (blue)

  // Close button on each toast calls this to remove just that one.
  dismiss(id: number) { this.toasts.update(list => list.filter(t => t.id !== id)); }

  // ---- internal: add a toast + schedule its auto-remove ----
  private push(kind: Toast['kind'], text: string) {
    const id = this.nextId++;
    // Prepend so newest appears on top.
    this.toasts.update(list => [{ id, kind, text }, ...list]);
    // Errors stay 6s, success/info 3.5s, then auto-remove.
    const life = kind === 'err' ? 6000 : 3500;
    setTimeout(() => this.dismiss(id), life);
  }
}