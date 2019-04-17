import { Component } from '@angular/core';
import { OnInit } from '@angular/core';
import { TasksStore } from '../../store/tasks-store';
import { DriveStore } from '../../store/drive-store';
import { catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
    selector: 'demo-store-section',
    templateUrl: './store-section.component.html',
    styleUrls: ['./store-section.component.scss']
})
export class DemoStoreSectionComponent implements OnInit {
    constructor(public tasksStore: TasksStore, public driveStore: DriveStore) {}
    addFile() {
        this.driveStore.dispatch('addFile');
    }

    changeFold() {
        this.driveStore.changeFold();
    }

    ngOnInit() {
        this.driveStore
            .applyError()
            .pipe(
                tap(() => {
                    console.log('tap');
                }),
                catchError(() => {
                    return of('error');
                })
            )
            .subscribe(
                data => {
                    console.log(data);
                },
                error => {
                    console.log(error);
                }
            );
    }
}
