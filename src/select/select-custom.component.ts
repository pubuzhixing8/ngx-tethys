import {
    Component,
    forwardRef,
    HostBinding,
    Input,
    ElementRef,
    OnInit,
    ContentChildren,
    QueryList,
    Output,
    EventEmitter,
    TemplateRef,
    ContentChild,
    ViewChild,
    Renderer2,
    OnDestroy,
    ChangeDetectorRef,
    InjectionToken,
    Inject,
    NgZone,
    AfterContentInit,
    ChangeDetectionStrategy
} from '@angular/core';
import { UpdateHostClassService } from '../shared/update-host-class.service';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import {
    ThyOptionComponent,
    OptionSelectionChange,
    THY_SELECT_OPTION_PARENT_COMPONENT,
    IThySelectOptionParentComponent,
    _countGroupLabelsBeforeOption
} from './option.component';
import { inputValueToBoolean, isArray } from '../util/helpers';
import { ScrollStrategy, Overlay, ViewportRuler, ConnectionPositionPair } from '@angular/cdk/overlay';
import { takeUntil, startWith, take, switchMap, skip } from 'rxjs/operators';
import { Subject, Observable, merge, defer, empty } from 'rxjs';
import { EXPANDED_DROPDOWN_POSITIONS } from '../core/overlay/overlay-opsition-map';
import { ThySelectOptionGroupComponent } from './option-group.component';
import { SelectionModel } from '@angular/cdk/collections';

export type InputSize = 'xs' | 'sm' | 'md' | 'lg' | '';

export type SelectMode = 'multiple' | '';

/** The max height of the select's overlay panel */
export const SELECT_PANEL_MAX_HEIGHT = 300;

// TODO(josephperrott): Revert to a constant after 2018 spec updates are fully merged.
/**
 * Distance between the panel edge and the option text in
 * multi-selection mode.
 *
 * Calculated as:
 * (SELECT_PANEL_PADDING_X * 1.5) + 20 = 44
 * The padding is multiplied by 1.5 because the checkbox's margin is half the padding.
 * The checkbox width is 16px.
 */
export let SELECT_MULTIPLE_PANEL_PADDING_X = 0;

/**
 * The select panel will only "fit" inside the viewport if it is positioned at
 * this value or more away from the viewport boundary.
 */
export const SELECT_PANEL_VIEWPORT_PADDING = 8;

export interface OptionValue {
    thyLabelText?: string;
    thyValue?: string;
    thyDisabled?: boolean;
    thyShowOptionCustom?: boolean;
    thySearchKey?: string;
}

const noop = () => {};

@Component({
    selector: 'thy-custom-select',
    templateUrl: './select-custom.component.html',
    exportAs: 'thyCustomSelect',
    providers: [
        {
            provide: THY_SELECT_OPTION_PARENT_COMPONENT,
            useExisting: ThySelectCustomComponent
        },
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => ThySelectCustomComponent),
            multi: true
        },
        UpdateHostClassService
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThySelectCustomComponent
    implements ControlValueAccessor, IThySelectOptionParentComponent, OnInit, AfterContentInit, OnDestroy {
    searchText: string;

    _disabled = false;

    _size: InputSize;

    _mode: SelectMode;

    _emptyStateText: string;

    _classNames: any = [];

    _viewContentInitialized = false;

    _loadingDone = true;

    _scrollStrategy: ScrollStrategy;

    _modalValue: any;

    _triggerFontSize = 0;

    private _scrollTop = 0;

    private maxPanelHeight = SELECT_PANEL_MAX_HEIGHT;

    _selectionModel: SelectionModel<ThyOptionComponent>;

    /**
     * The y-offset of the overlay panel in relation to the trigger's top start corner.
     * This must be adjusted to align the selected option text over the trigger text.
     * when the panel opens. Will change based on the y-position of the selected option.
     */
    _offsetY = 0;

    positions = [
        {
            originX: 'start',
            originY: 'top',
            overlayX: 'start',
            overlayY: 'top'
        },
        {
            originX: 'start',
            originY: 'bottom',
            overlayX: 'start',
            overlayY: 'bottom'
        }
    ];

    /** The last measured value for the trigger's client bounding rect. */
    triggerRect: ClientRect;

    /** The value of the select panel's transform-origin property. */
    _transformOrigin = 'top';

    /** Emits whenever the component is destroyed. */
    private readonly _destroy$ = new Subject<void>();

    private onTouchedCallback: () => void = noop;

    private onChangeCallback: (_: any) => void = noop;

    @HostBinding('class.thy-select-custom') _isSelectCustom = true;

    @HostBinding('class.thy-select') _isSelect = true;

    // 下拉选项是否展示
    @HostBinding('class.menu-is-opened') _panelOpen = false;

    @Output() thyOnSearch: EventEmitter<any> = new EventEmitter<any>();

    @Input() thyShowSearch: boolean;

    @Input() thyPlaceHolder: string;

    @Input() thyServerSearch: boolean;

    @Input() thyShowOptionMenu: boolean;

    @Input()
    set thyMode(value: SelectMode) {
        this._mode = value;
    }

    get thyMode(): SelectMode {
        return this._mode;
    }

    @Input()
    set thySize(value: InputSize) {
        this._size = value;
    }

    @Input()
    set thyEmptyStateText(value: string) {
        this._emptyStateText = value;
    }

    @Input() thyAllowClear = false;

    @Input()
    set thyLoadingDone(value: boolean) {
        this._loadingDone = inputValueToBoolean(value);
    }

    @Input()
    set thyDisabled(value: string) {
        this._disabled = inputValueToBoolean(value);
    }

    /** Whether the select has a value. */
    get empty(): boolean {
        return !this._selectionModel || this._selectionModel.isEmpty();
    }

    /** The currently selected option. */
    get selected(): ThyOptionComponent | ThyOptionComponent[] {
        return this.thyMode === 'multiple' ? this._selectionModel.selected : this._selectionModel.selected[0];
    }

    get selectedDisplayContext(): any {
        const selectedValues = this._selectionModel.selected;
        if (selectedValues.length === 0) {
            return null;
        }
        const context = selectedValues.map((option: ThyOptionComponent) => {
            return option.thyRawValue || option.thyValue;
        });
        if (this.thyMode === 'multiple') {
            return {
                $implicit: context
            };
        } else {
            return {
                $implicit: context[0]
            };
        }
    }

    readonly optionSelectionChanges: Observable<OptionSelectionChange> = defer(() => {
        if (this.options) {
            return merge(...this.options.map(option => option.selectionChange));
        }
        return this._ngZone.onStable.asObservable().pipe(
            take(1),
            switchMap(() => this.optionSelectionChanges)
        );
    }) as Observable<OptionSelectionChange>;

    @ContentChild('selectedDisplay') selectedValueDisplayRef: TemplateRef<any>;

    @ViewChild('trigger') trigger: ElementRef<any>;

    @ContentChildren(ThyOptionComponent, { descendants: true }) options: QueryList<ThyOptionComponent>;

    @ContentChildren(ThySelectOptionGroupComponent) optionGroups: QueryList<ThySelectOptionGroupComponent>;

    constructor(
        private _ngZone: NgZone,
        private elementRef: ElementRef,
        private updateHostClassService: UpdateHostClassService,
        private renderer: Renderer2,
        private overlay: Overlay,
        private viewportRuler: ViewportRuler,
        private changeDetectorRef: ChangeDetectorRef
    ) {
        this.updateHostClassService.initializeElement(elementRef.nativeElement);
    }

    writeValue(value: any): void {
        this._modalValue = value;
        if (this.options && this.options.length > 0) {
            this._setSelecttionByModelValue(this._modalValue);
        }
    }

    ngOnInit() {
        this._scrollStrategy = this.overlay.scrollStrategies.reposition();
        this.viewportRuler
            .change()
            .pipe(takeUntil(this._destroy$))
            .subscribe(() => {
                if (this._panelOpen) {
                    this.triggerRect = this.trigger.nativeElement.getBoundingClientRect();
                    this.changeDetectorRef.markForCheck();
                }
            });
        this._instanceSelectionModel();
        if (this._size) {
            this._classNames.push(`thy-select-${this._size}`);
        }
        if (this._mode === 'multiple') {
            this._classNames.push(`thy-select-custom--multiple`);
        }
        this.updateHostClassService.updateClass(this._classNames);
        // if (this.thyShowSearch) {
        //     this.maxPanelHeight = 350;
        // }
    }

    ngAfterContentInit() {
        this._selectionModel.onChange.pipe(takeUntil(this._destroy$)).subscribe(event => {
            event.added.forEach(option => option.select());
            event.removed.forEach(option => option.deselect());
        });
        this.options.changes
            .pipe(
                startWith(null),
                takeUntil(this._destroy$)
            )
            .subscribe(() => {
                this._resetOptions();
                this._initializeSelection();
            });
    }

    get panelOpen(): boolean {
        return this._panelOpen;
    }

    _resetOptions() {
        const changedOrDestroyed$ = merge(this.options.changes, this._destroy$);

        this.optionSelectionChanges.pipe(takeUntil(changedOrDestroyed$)).subscribe((event: OptionSelectionChange) => {
            this._onSelect(event.option);
            if (this.thyMode !== 'multiple' && this._panelOpen) {
                this.close();
            }
        });
    }

    _initializeSelection() {
        Promise.resolve().then(() => {
            this._setSelecttionByModelValue(this._modalValue);
        });
    }

    _setSelecttionByModelValue(modalValue: any) {
        this._selectionModel.clear();
        if (!modalValue) {
            this.changeDetectorRef.markForCheck();
            return;
        }
        if (this._mode === 'multiple') {
            if (isArray(modalValue)) {
                this.options.forEach(option => {
                    const index = (modalValue as Array<any>).findIndex(itemValue => {
                        return itemValue === option.thyValue;
                    });
                    if (index >= 0) {
                        this._selectionModel.select(option);
                    }
                });
            }
        } else {
            const selectedOption = this.options.find(option => {
                return option.thyValue === modalValue;
            });
            if (selectedOption) {
                this._selectionModel.select(selectedOption);
            }
        }
        this.changeDetectorRef.markForCheck();
    }

    /** Calculates the amount of items in the select. This includes options and group labels. */
    private _getItemCount(): number {
        return (
            this.options.filter(option => !option.hidden).length +
            this.optionGroups.filter(optionGroup => !optionGroup.hidden).length
        );
    }

    /** Calculates the height of the select's options. */
    private _getItemHeight(): number {
        return 40;
    }

    /** Gets the index of the provided option in the option list. */
    private _getOptionIndex(option: ThyOptionComponent): number | undefined {
        return this.options.reduce((result: number | undefined, current: ThyOptionComponent, index: number) => {
            return result === undefined ? (option === current ? index : undefined) : result;
        }, undefined);
    }

    /**
     * Checks that the attempted overlay position will fit within the viewport.
     * If it will not fit, tries to adjust the scroll position and the associated
     * y-offset so the panel can open fully on-screen. If it still won't fit,
     * sets the offset back to 0 to allow the fallback position to take over.
     */
    private _checkOverlayWithinViewport(maxScroll: number): void {
        const itemHeight = this._getItemHeight();
        const viewportSize = this.viewportRuler.getViewportSize();

        const topSpaceAvailable = this.triggerRect.top - SELECT_PANEL_VIEWPORT_PADDING;
        const bottomSpaceAvailable = viewportSize.height - this.triggerRect.bottom - SELECT_PANEL_VIEWPORT_PADDING;

        const panelHeightTop = Math.abs(this._offsetY);
        const totalPanelHeight = Math.min(this._getItemCount() * itemHeight, this.maxPanelHeight);
        const panelHeightBottom = totalPanelHeight - panelHeightTop - this.triggerRect.height;

        if (panelHeightBottom > bottomSpaceAvailable) {
            this._adjustPanelUp(panelHeightBottom, bottomSpaceAvailable);
        } else if (panelHeightTop > topSpaceAvailable) {
            this._adjustPanelDown(panelHeightTop, topSpaceAvailable, maxScroll);
        } else {
            this._transformOrigin = this._getOriginBasedOnOption();
        }
    }

    /** Adjusts the overlay panel up to fit in the viewport. */
    private _adjustPanelUp(panelHeightBottom: number, bottomSpaceAvailable: number) {
        // Browsers ignore fractional scroll offsets, so we need to round.
        const distanceBelowViewport = Math.round(panelHeightBottom - bottomSpaceAvailable);

        // Scrolls the panel up by the distance it was extending past the boundary, then
        // adjusts the offset by that amount to move the panel up into the viewport.
        this._scrollTop -= distanceBelowViewport;
        this._offsetY -= distanceBelowViewport;
        this._transformOrigin = this._getOriginBasedOnOption();

        // If the panel is scrolled to the very top, it won't be able to fit the panel
        // by scrolling, so set the offset to 0 to allow the fallback position to take
        // effect.
        if (this._scrollTop <= 0) {
            this._scrollTop = 0;
            this._offsetY = 0;
            this._transformOrigin = `50% bottom 0px`;
        }
    }

    /** Adjusts the overlay panel down to fit in the viewport. */
    private _adjustPanelDown(panelHeightTop: number, topSpaceAvailable: number, maxScroll: number) {
        // Browsers ignore fractional scroll offsets, so we need to round.
        const distanceAboveViewport = Math.round(panelHeightTop - topSpaceAvailable);

        // Scrolls the panel down by the distance it was extending past the boundary, then
        // adjusts the offset by that amount to move the panel down into the viewport.
        this._scrollTop += distanceAboveViewport;
        this._offsetY += distanceAboveViewport;
        this._transformOrigin = this._getOriginBasedOnOption();

        // If the panel is scrolled to the very bottom, it won't be able to fit the
        // panel by scrolling, so set the offset to 0 to allow the fallback position
        // to take effect.
        if (this._scrollTop >= maxScroll) {
            this._scrollTop = maxScroll;
            this._offsetY = 0;
            this._transformOrigin = `50% top 0px`;
            return;
        }
    }

    /** Sets the transform origin point based on the selected option. */
    private _getOriginBasedOnOption(): string {
        const itemHeight = this._getItemHeight();
        const optionHeightAdjustment = (itemHeight - this.triggerRect.height) / 2;
        const originY = Math.abs(this._offsetY) - optionHeightAdjustment + itemHeight / 2;
        return `50% ${originY}px 0px`;
    }

    /**
     * Calculates the y-offset of the select's overlay panel in relation to the
     * top start corner of the trigger. It has to be adjusted in order for the
     * selected option to be aligned over the trigger when the panel opens.
     */
    private _calculateOverlayOffsetY(selectedIndex: number, scrollBuffer: number, maxScroll: number): number {
        const itemHeight = this._getItemHeight();
        const optionHeightAdjustment = (itemHeight - this.triggerRect.height) / 2;
        const maxOptionsDisplayed = Math.floor(this.maxPanelHeight / itemHeight);
        let optionOffsetFromPanelTop: number;

        // Disable offset if requested by user by returning 0 as value to offset
        // if (this._disableOptionCentering) {
        //     return 0;
        // }

        if (this._scrollTop === 0) {
            optionOffsetFromPanelTop = selectedIndex * itemHeight;
        } else if (this._scrollTop === maxScroll) {
            const firstDisplayedIndex = this._getItemCount() - maxOptionsDisplayed;
            const selectedDisplayIndex = selectedIndex - firstDisplayedIndex;

            // The first item is partially out of the viewport. Therefore we need to calculate what
            // portion of it is shown in the viewport and account for it in our offset.
            const partialItemHeight =
                itemHeight - ((this._getItemCount() * itemHeight - this.maxPanelHeight) % itemHeight);

            // Because the panel height is longer than the height of the options alone,
            // there is always extra padding at the top or bottom of the panel. When
            // scrolled to the very bottom, this padding is at the top of the panel and
            // must be added to the offset.
            optionOffsetFromPanelTop = selectedDisplayIndex * itemHeight + partialItemHeight;
        } else {
            // If the option was scrolled to the middle of the panel using a scroll buffer,
            // its offset will be the scroll buffer minus the half height that was added to
            // center it.
            optionOffsetFromPanelTop = scrollBuffer - itemHeight / 2;
        }

        // The final offset is the option's offset from the top, adjusted for the height difference,
        // multiplied by -1 to ensure that the overlay moves in the correct direction up the page.
        // The value is rounded to prevent some browsers from blurring the content.
        return Math.round(optionOffsetFromPanelTop * -1 - optionHeightAdjustment);
    }

    private _calculateOverlayPosition(): void {
        const itemHeight = this._getItemHeight();
        const items = this._getItemCount();
        const panelHeight = Math.min(items * itemHeight, this.maxPanelHeight);
        const scrollContainerHeight = items * itemHeight;

        // The farthest the panel can be scrolled before it hits the bottom
        const maxScroll = scrollContainerHeight - panelHeight;

        // If no value is selected we open the popup to the first item.
        // tslint:disable-next-line:no-non-null-assertion
        let selectedOptionOffset = this.empty ? 0 : this._getOptionIndex(this._selectionModel.selected[0])!;

        selectedOptionOffset += _countGroupLabelsBeforeOption(selectedOptionOffset, this.options, this.optionGroups);

        // We must maintain a scroll buffer so the selected option will be scrolled to the
        // center of the overlay panel rather than the top.
        const scrollBuffer = panelHeight / 2;
        this._scrollTop = this._calculateOverlayScroll(selectedOptionOffset, scrollBuffer, maxScroll);
        this._offsetY = this._calculateOverlayOffsetY(selectedOptionOffset, scrollBuffer, maxScroll);

        this._checkOverlayWithinViewport(maxScroll);
    }

    /**
     * Calculates the scroll position of the select's overlay panel.
     *
     * Attempts to center the selected option in the panel. If the option is
     * too high or too low in the panel to be scrolled to the center, it clamps the
     * scroll position to the min or max scroll positions respectively.
     */
    _calculateOverlayScroll(selectedIndex: number, scrollBuffer: number, maxScroll: number): number {
        const itemHeight = this._getItemHeight();
        const optionOffsetFromScrollTop = itemHeight * selectedIndex;
        const halfOptionHeight = itemHeight / 2;

        // Starts at the optionOffsetFromScrollTop, which scrolls the option to the top of the
        // scroll container, then subtracts the scroll buffer to scroll the option down to
        // the center of the overlay panel. Half the option height must be re-added to the
        // scrollTop so the option is centered based on its middle, not its top edge.
        const optimalScrollPosition = optionOffsetFromScrollTop - scrollBuffer + halfOptionHeight;
        return Math.min(Math.max(0, optimalScrollPosition), maxScroll);
    }

    registerOnChange(fn: any): void {
        this.onChangeCallback = fn;
    }

    registerOnTouched(fn: any): void {
        this.onTouchedCallback = fn;
    }

    private _emitModelValueChange() {
        const selectedValues = this._selectionModel.selected;
        const changeValue = selectedValues.map((option: ThyOptionComponent) => {
            return option.thyValue;
        });
        if (this._mode === 'multiple') {
            this._modalValue = changeValue;
        } else {
            if (changeValue.length === 0) {
                this._modalValue = null;
            } else {
                this._modalValue = changeValue[0];
            }
        }
        this.onChangeCallback(this._modalValue);
    }

    remove(item: ThyOptionComponent, event?: Event) {
        if (event) {
            event.stopPropagation();
        }
        if (this._disabled) {
            return;
        }
        item.deselect();
    }

    clearSelectValue(event?: Event) {
        if (event) {
            event.stopPropagation();
        }
        if (this._disabled) {
            return;
        }
        this._selectionModel.clear();
        this.changeDetectorRef.markForCheck();
        this._emitModelValueChange();
    }

    toggle(): void {
        this._panelOpen ? this.close() : this.open();
    }

    open(): void {
        if (this._disabled || !this.options || !this.options.length || this._panelOpen) {
            return;
        }
        this.triggerRect = this.trigger.nativeElement.getBoundingClientRect();
        // this._calculateOverlayPosition();
        this._checkOverlayWithinViewport();
        this._panelOpen = true;
        this.changeDetectorRef.markForCheck();
    }

    close(): void {
        if (this._panelOpen) {
            this._panelOpen = false;
            this.changeDetectorRef.markForCheck();
        }
    }

    onSearchFilter() {
        if (this.thyServerSearch) {
            this.thyOnSearch.emit(this.searchText);
        } else {
            this.options.forEach(option => {
                if (option.matchSearchText(this.searchText)) {
                    option.showOption();
                } else {
                    option.hideOption();
                }
            });
        }
    }

    private _instanceSelectionModel() {
        this._selectionModel = new SelectionModel<ThyOptionComponent>(this._mode === 'multiple');
    }

    _onSelect(option: ThyOptionComponent, event?: Event) {
        const wasSelected = this._selectionModel.isSelected(option);

        if (option.thyValue == null && this.thyMode !== 'multiple') {
            option.deselect();
            this._selectionModel.clear();
        } else {
            option.selected ? this._selectionModel.select(option) : this._selectionModel.deselect(option);
        }

        if (wasSelected !== this._selectionModel.isSelected(option)) {
            this._emitModelValueChange();
        }
        this.changeDetectorRef.markForCheck();
    }

    ngOnDestroy() {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
