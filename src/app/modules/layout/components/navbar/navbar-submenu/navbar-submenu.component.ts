import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { SubMenuItem } from 'src/app/core/models/menu.model';

@Component({
  selector: 'div[navbar-submenu]',
  standalone: true,
  templateUrl: './navbar-submenu.component.html',
  styleUrls: ['./navbar-submenu.component.css'],
  imports: [NgTemplateOutlet, RouterLinkActive, RouterLink, AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarSubmenuComponent implements OnInit {
  @Input() public submenu = <SubMenuItem[]>{};
  @ViewChild('submenuRef') submenuRef: ElementRef<HTMLDivElement> | undefined;

  constructor() {}

  ngOnInit(): void {}

  ngAfterViewInit() {
    /**
     * check if component is out of the screen
     */
    if (this.submenuRef) {
      const submenu = this.submenuRef.nativeElement.getBoundingClientRect();
      const bounding = document.body.getBoundingClientRect();

      if (submenu.right > bounding.right) {
        const childrenElement = this.submenuRef.nativeElement.parentNode as HTMLElement;
        if (childrenElement) {
          childrenElement.style.left = '-100%';
        }
      }
    }
  }
}
