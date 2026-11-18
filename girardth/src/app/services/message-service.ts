import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  messages = signal<string[]>([]);
  readonly toasts = signal<ToastMessage[]>([]);
  private nextToastId = 0;

  add(message: string): void {
    this.messages.update((msgs) => [...msgs, message]);
  }

  clear(): void {
    this.messages.set([]);
  }

  notify(text: string): void {
    const id = this.nextToastId++;
    this.toasts.update((toasts) => [...toasts, { id, text }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }
}
