import { NgModule } from '@angular/core';
import { AngularSvgIconModule } from 'angular-svg-icon';

import { LayoutRoutingModule } from 'src/app/modules/layout/layout-routing.module';
@NgModule({ imports: [LayoutRoutingModule, AngularSvgIconModule.forRoot()], providers: [] })
export class LayoutModule {}
