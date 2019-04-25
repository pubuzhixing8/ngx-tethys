import {
    Component,
    Input,
    TemplateRef,
    ViewChild,
    ChangeDetectionStrategy,
    HostBinding,
    HostListener,
    ElementRef,
    InjectionToken,
    ChangeDetectorRef,
    EventEmitter,
    OnDestroy,
    Output,
    Inject,
    Optional,
    QueryList
} from '@angular/core';
import { ThyOptionGroupComponent } from '../core';
export class OptionSelectionChange {
    option: ThyOptionComponent;
    selected: boolean;
}

export class OptionVisiableChange {
    option: ThyOptionComponent;
}

export interface IThySelectOptionParentComponent {
    thyMode: 'multiple' | '';
}

/**
 * Injection token used to provide the parent component to options.
 */
export const THY_SELECT_OPTION_PARENT_COMPONENT = new InjectionToken<IThySelectOptionParentComponent>(
    'THY_SELECT_OPTION_PARENT_COMPONENT'
);

/**
 * Counts the amount of option group labels that precede the specified option.
 * @param optionIndex Index of the option at which to start counting.
 * @param options Flat list of all of the options.
 * @param optionGroups Flat list of all of the option groups.
 * @docs-private
 */
export function _countGroupLabelsBeforeOption(
    optionIndex: number,
    options: QueryList<ThyOptionComponent>,
    optionGroups: QueryList<ThyOptionGroupComponent>
): number {
    if (optionGroups.length) {
        const optionsArray = options.toArray();
        const groups = optionGroups.toArray();
        let groupCounter = 0;

        for (let i = 0; i < optionIndex + 1; i++) {
            if (optionsArray[i].group && optionsArray[i].group === groups[groupCounter]) {
                groupCounter++;
            }
        }

        return groupCounter;
    }

    return 0;
}

@Component({
    selector: 'thy-option',
    templateUrl: './option.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThyOptionComponent implements OnDestroy {
    private _selected = false;
    private _hidden = false;
    @Input() thyValue: any;

    @Input() thyRawValue: any;

    @Input() thyLabelText: string;

    @Input() thyShowOptionCustom: boolean;

    @Input() thySearchKey: string;

    @HostBinding('class.thy-option-item') _isOptionItem = true;

    @ViewChild(TemplateRef) template: TemplateRef<any>;

    @Input()
    @HostBinding(`class.disabled`)
    thyDisabled: boolean;

    @HostBinding('class.hidden')
    get hidden(): boolean {
        return this._hidden;
    }

    /** Whether or not the option is currently selected. */
    @HostBinding(`class.active`)
    get selected(): boolean {
        return this._selected;
    }

    @Output() readonly selectionChange: EventEmitter<OptionSelectionChange> = new EventEmitter();
    @Output() readonly visiableChange: EventEmitter<OptionVisiableChange> = new EventEmitter();

    constructor(
        public element: ElementRef<HTMLElement>,
        @Optional() @Inject(THY_SELECT_OPTION_PARENT_COMPONENT) public parent: IThySelectOptionParentComponent,
        @Optional() readonly group: ThyOptionGroupComponent,
        private cdr: ChangeDetectorRef
    ) {}

    @HostListener('click', ['$event'])
    onClick(event: Event) {
        if (this.parent.thyMode === 'multiple') {
            this._selected ? this.deselect() : this.select();
        } else {
            this.select();
        }
    }

    /** Selects the option. */
    select(event?: Event): void {
        if (!this.thyDisabled) {
            if (!this._selected) {
                this._selected = true;
                this.selectionChange.emit({
                    option: this,
                    selected: this._selected
                });
                this.cdr.markForCheck();
            }
        }
    }

    /** Deselects the option. */
    deselect(): void {
        if (this._selected) {
            this._selected = false;
            this.selectionChange.emit({
                option: this,
                selected: this._selected
            });
            this.cdr.markForCheck();
        }
    }

    hideOption() {
        if (!this._hidden) {
            this._hidden = true;
            this.visiableChange.emit({ option: this });
            this.cdr.markForCheck();
        }
    }

    showOption() {
        if (this._hidden) {
            this._hidden = false;
            this.visiableChange.emit({ option: this });
            this.cdr.markForCheck();
        }
    }

    matchSearchText(searchText: string): boolean {
        if (this.thySearchKey) {
            if (this.thySearchKey.indexOf(searchText) >= 0) {
                return true;
            } else {
                return false;
            }
        } else {
            if (this.thyLabelText.indexOf(searchText) >= 0) {
                return true;
            } else {
                return false;
            }
        }
    }

    ngOnDestroy() {}
}
