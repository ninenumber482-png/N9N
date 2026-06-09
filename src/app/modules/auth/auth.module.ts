import { NgModule } from '@angular/core';

import { AngularSvgIconModule } from 'angular-svg-icon';
import { AuthRoutingModule } from 'src/app/modules/auth/auth-routing.module';

@NgModule({ imports: [AuthRoutingModule, AngularSvgIconModule], providers: [] })
export class AuthModule {}
