import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';

@Component({
  selector: 'app-bottom-navbar',
  standalone: true,
  templateUrl: './bottom-navbar.component.html',
  styleUrls: ['./bottom-navbar.component.css'],
  imports: [AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomNavbarComponent implements OnInit {
  private router = inject(Router);

  constructor() {}

  ngOnInit(): void {}

  navigate(path: string): void {
    this.router.navigate([path]);
  }
}
