import { Component, Input, OnInit } from '@angular/core';
import { IActivity } from 'src/app/shared/models/activity';

@Component({
  selector: 'app-activity-item',
  templateUrl: './activity-item.component.html',
  styleUrls: ['./activity-item.component.scss'],
})
export class ActivityItemComponent implements OnInit {
  @Input() activity!: IActivity;
  constructor() {}

  ngOnInit() {
    // this.activity.date = this.activity.date.split('');
  }
}
