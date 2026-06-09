import { Injectable, inject } from '@angular/core';
import { toast } from 'ngx-sonner';
import { ToastService } from 'src/app/core/services/toast.service';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private toastService = inject(ToastService);

  success(message: string, description?: string): void {
    this.toastService.success(message, description, 4000);
  }

  error(message: string, description?: string): void {
    this.toastService.error(message, description, 5000);
  }

  info(message: string, description?: string): void {
    this.toastService.info(message, description, 3000);
  }

  warning(message: string, description?: string): void {
    this.toastService.warning(message, description, 4000);
  }

  loading(message: string): string | number {
    return toast.loading(message, { position: 'top-right' });
  }

  promise<T>(promise: Promise<T>, messages: { loading: string; success: string; error: string }): void {
    toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    });
  }
}
