import { Component, OnInit, HostBinding, Input, Output, EventEmitter, ElementRef, ViewChild } from '@angular/core';
import { ThyPopBoxService } from '../../pop-box';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { ComponentType } from '@angular/cdk/portal';
import { ThyMenuComponent } from '../menu.component';

@Component({
    selector: 'thy-menu-group, [thy-menu-group],[thyMenuGroup]',
    templateUrl: './menu-group.component.html',
    animations: [
        trigger('detailsContentAnimation', [
            state(
                'void',
                style({
                    height: '*'
                })
            ),
            state(
                '1',
                style({
                    height: 0,
                    overflow: 'hidden'
                })
            ),
            state(
                '0',
                style({
                    height: '*'
                })
            ),
            transition('* => *', animate('0ms ease-out'))
        ])
    ]
})
export class ThyMenuGroupComponent implements OnInit {
    public _actionMenu: ElementRef | ComponentType<any>;

    public rightIconClass = 'wtf wtf-more-lg';

    public iconClass = 'wtf wtf-drive-o';

    public groupHeaderPaddingLeft = 0;

    @ViewChild('thyMenuGroup') _thyMenuGroup: ElementRef;

    @HostBinding('class.thy-menu-group') isThyMenuGroup = true;

    @HostBinding('class.has-icon') showIcon = false;

    @HostBinding('class.collapsed') isCollapsed = true;

    @Input() thyTitle = '';

    @Input('thyExpand')
    set thyExpand(value: boolean) {
        this.isCollapsed = !!!value;
    }

    @Input('thyShowIcon')
    set thyShowIcon(value: boolean) {
        this.showIcon = value;
    }

    @Input('thyIcon')
    set thyIcon(value: string) {
        this.iconClass = value;
    }

    @Input('thyActionIcon')
    set thyActionIcon(value: string) {
        this.rightIconClass = value;
    }

    @Input() thyShowAction = false;

    @Input() thyActionStopPropagation = true;

    @Output() thyOnActionClick: EventEmitter<Event> = new EventEmitter<Event>();

    @Input()
    set thyActionMenu(value: ElementRef) {
        this._actionMenu = value;
    }

    constructor(private popBoxService: ThyPopBoxService) {}

    ngOnInit(): void {}

    collapseGroup(): void {
        this.isCollapsed = !this.isCollapsed;
    }

    onActionClick(event: Event): void {
        if (this.thyActionStopPropagation) {
            event.stopPropagation();
        }
        if (this._actionMenu) {
            this.popBoxService.show(this._actionMenu, {
                target: event.currentTarget,
                insideAutoClose: true,
                stopPropagation: true,
                placement: 'bottom right'
            });
        } else {
            this.thyOnActionClick.emit(event);
        }
    }
}
