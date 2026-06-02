import { Injectable } from '@angular/core';
import { toast } from 'ngx-sonner';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  constructor() {}

  success(message: string, description?: string): void {
    toast.success(message, {
      description: description || '',
      duration: 4000,
      position: 'top-right',
    });
  }

  error(message: string, description?: string): void {
    toast.error(message, {
      description: description || '',
      duration: 3000,
      position: 'top-right',
    });
  }

  info(message: string, description?: string): void {
    toast.info(message, {
      description: description || '',
      duration: 3000,
      position: 'top-right',
    });
  }

  warning(message: string, description?: string): void {
    toast.warning(message, {
      description: description || '',
      duration: 4000,
      position: 'top-right',
    });
  }

  loading(message: string): string | number {
    return toast.loading(message, {
      position: 'top-right',
    });
  }

  promise<T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ): void {
    toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    });
  }
}
