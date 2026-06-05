
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-responsive-helper',
  standalone: true,
  templateUrl: './responsive-helper.component.html',
  styleUrls: ['./responsive-helper.component.css'],
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponsiveHelperComponent implements OnInit {
  public env: any = environment;

  constructor() {}

  ngOnInit(): void {}
}
