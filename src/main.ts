import { importProvidersFrom, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeId from '@angular/common/locales/id';

import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AppRoutingModule } from './app/app-routing.module';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { provideZonelessChangeDetection } from '@angular/core';
import { AuthInterceptor } from './app/core/interceptor/auth.interceptor';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Lara from '@primeuix/themes/lara';

registerLocaleData(localeId);

// NUMBER9 corporate/SaaS theme — Lara base with custom brand tokens
const N9Theme = definePreset(Lara, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '3px',
      sm: '5px',
      md: '7px',
      lg: '10px',
      xl: '14px',
    },
  },
  semantic: {
    primary: {
      50:  '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
    colorScheme: {
      light: {
        primary: {
          color:         '#2563eb',
          contrastColor: '#ffffff',
          hoverColor:    '#1d4ed8',
          activeColor:   '#1e40af',
        },
        surface: {
          0:   '#ffffff',
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        formField: {
          background:       '#ffffff',
          borderColor:      '#e2e8f0',
          hoverBorderColor: '#94a3b8',
          focusBorderColor: '#2563eb',
          paddingX:         '0.75rem',
          paddingY:         '0.5rem',
          fontSize:         '0.875rem',
        },
      },
      dark: {
        primary: {
          color:         '#3b82f6',
          contrastColor: '#ffffff',
          hoverColor:    '#2563eb',
          activeColor:   '#1d4ed8',
        },
        surface: {
          0:   '#0b1120',
          50:  '#0f172a',
          100: '#1e293b',
          200: '#334155',
          300: '#475569',
          400: '#64748b',
          500: '#94a3b8',
          600: '#cbd5e1',
          700: '#e2e8f0',
          800: '#f1f5f9',
          900: '#f8fafc',
          950: '#ffffff',
        },
        formField: {
          background:       '#1e293b',
          borderColor:      '#334155',
          hoverBorderColor: '#475569',
          focusBorderColor: '#3b82f6',
        },
      },
    },
  },
  components: {
    tag: {
      root: {
        borderRadius: '4px',
        fontSize:     '0.7rem',
        fontWeight:   '700',
        padding:      '0.2rem 0.5rem',
      },
    },
    button: {
      root: {
        borderRadius: '6px',
        paddingX:     '0.875rem',
        paddingY:     '0.5rem',
      },
    },
    select: {
      root: {
        borderRadius: '6px',
        paddingX:     '0.75rem',
        paddingY:     '0.45rem',
      },
    },
    inputtext: {
      root: {
        borderRadius: '6px',
        paddingX:     '0.75rem',
        paddingY:     '0.45rem',
      },
    },
    dialog: {
      root: {
        borderRadius: '12px',
      },
    },
    card: {
      root: {
        borderRadius: '10px',
      },
    },
    paginator: {
      root: {
        borderRadius: '8px',
      },
    },
  },
});

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(BrowserModule, AppRoutingModule),
    provideAnimations(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: LOCALE_ID, useValue: 'id' },
    providePrimeNG({
      theme: {
        preset: N9Theme,
        options: {
          darkModeSelector: '.dark',
          cssLayer: { name: 'primeng', order: 'tailwind-base, primeng, tailwind-utilities' },
        },
      },
    }),
  ],
}).catch((err) => console.error(err));

if (environment.production && typeof window !== 'undefined') {
  (() => {
    setTimeout(() => {
      console.log(
        '%c** STOP **',
        'font-weight:bold; font: 2.5em Arial; color: white; background-color: #e11d48; padding-left: 15px; padding-right: 15px; border-radius: 25px; padding-top: 5px; padding-bottom: 5px;',
      );
      console.log(
        '\n%cThis is a browser feature intended for developers. Using this console may allow attackers to impersonate you and steal your information using an attack called Self-XSS. Do not enter or paste code that you do not understand.',
        'font-weight:bold; font: 2em Arial; color: #e11d48;',
      );
    });
  })();
}
