import { Injectable, inject } from '@angular/core';
import { toast } from 'ngx-sonner';
import { ToastService } from 'src/app/core/services/toast.service';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private toastService = inject(ToastService);

  success(message: string, description?: string): void {
    // Show both ngx-sonner toast AND badge notification
    toast.success(message, {
      description: description || '',
      duration: 4000,
      position: 'top-right',
    });
    this.toastService.success(message, description, 4000);
  }

  error(message: string, description?: string): void {
    toast.error(message, {
      description: description || '',
      duration: 3000,
      position: 'top-right',
    });
    this.toastService.error(message, description, 5000);
  }

  info(message: string, description?: string): void {
    toast.info(message, {
      description: description || '',
      duration: 3000,
      position: 'top-right',
    });
    this.toastService.info(message, description, 3000);
  }

  warning(message: string, description?: string): void {
    toast.warning(message, {
      description: description || '',
      duration: 4000,
      position: 'top-right',
    });
    this.toastService.warning(message, description, 4000);
  }

  loading(message: string): string | number {
    return toast.loading(message, {
      position: 'top-right',
    });
  }

  promise<T>(promise: Promise<T>, messages: { loading: string; success: string; error: string }): void {
    toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    });
  }
}
