import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NavbarMobileMenuComponent } from 'src/app/modules/layout/components/navbar/navbar-mobile/navbar-mobile-menu/navbar-mobile-menu.component';

describe('NavbarMobileMenuComponent', () => {
  let component: NavbarMobileMenuComponent;
  let fixture: ComponentFixture<NavbarMobileMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarMobileMenuComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NavbarMobileMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
