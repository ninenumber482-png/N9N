import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SidebarSubmenuComponent } from 'src/app/modules/layout/components/sidebar/sidebar-submenu/sidebar-submenu.component';

describe('SidebarSubmenuComponent', () => {
  let component: SidebarSubmenuComponent;
  let fixture: ComponentFixture<SidebarSubmenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarSubmenuComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SidebarSubmenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
