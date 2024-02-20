import { AfterViewInit, Component, QueryList, ViewChildren } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { COMMA, ENTER } from '@angular/cdk/keycodes';

import { ChartDataset } from 'chart.js';

import { BehaviorSubject, combineLatest, merge, Observable, Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs/operators';

import { UserService } from './services/user.service';
import { DataService } from './services/data.service';
import { aggFuncs, charts, ChartType, metrics } from './services/chartTypes';
import { isValid, normalizeString, range } from './services/utils';
import { BaseChartDirective } from 'ng2-charts';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements AfterViewInit {
  @ViewChildren(BaseChartDirective) private charts!: QueryList<BaseChartDirective>;

  /**
   * A public property which is used to configure and display the user list for the administrator user according
   * the query parameters at the browser.
   * @type {Observable<boolean>}
   */
  public showUsers = this.activatedRoute.queryParams.pipe(map((q) => q['showUsers'] === 'true'));
  /**
   * The left chart parameters which are pulled from the query parameters passed to the browser.
   * @type {{[{ id: 'map', name: 'Mapa', comparable: true }, { id: 'bar', name: 'Evolutivo', comparable: true }, { id: 'line', name: 'Comparativo', comparable: false }, { id: 'line-with-map', name: 'Predictivo', comparable: false },] as const}}
   */
  public leftChart = this.activatedRoute.queryParams.pipe(
    map((q) => charts.find((c) => c.id === q['l-chart']) || charts[0]),
  );
  /**
   * The right chart parameters which are pulled from the query parameters passed to the browser.
   * @type {{[{ id: 'map', name: 'Mapa', comparable: true }, { id: 'bar', name: 'Evolutivo', comparable: true }, { id: 'line', name: 'Comparativo', comparable: false }, { id: 'line-with-map', name: 'Predictivo', comparable: false },] as const}}
   */
  public rightChart = this.activatedRoute.queryParams.pipe(
    map((q) => charts.find((c) => c.id === q['r-chart']) || charts[0]),
  );
  /**
   * An observable that emits a boolean value indicating whether the current left chart has **"comparative"**
   * property value to compare to another state.
   * @type {Observable<boolean>}
   */
  public comparableChart = this.leftChart.pipe(map((data) => data['comparable']));
  /**
   * An observable that combines two boolean values, indicating whether the current left chart has
   * **"comparative"** property has already a valid boolean value to compare to another state, if the combination
   * between the active route has been and the **comparableChart** is succesfully merged as a single url and the
   * chart is valid, then it will return an observable as a **true** boolean, otherwise it will return an
   * observable as **false**.
   * @type {Observable<boolean>}
   */
  public compare = combineLatest([
    this.activatedRoute.queryParams.pipe(map((q) => q['compare'] === 'true')),
    this.comparableChart,
  ]).pipe(map(([url, chart]) => url && (chart as boolean)));

  /**
   * Gets an observable data from left filter based on the query parameters.
   */
  public leftFilter = this.dataService.queryParams.pipe(
    filter(isValid),
    map((data) => data['left']),
    map(({ params }) => ({
      metric: metrics.find(({ id }) => id === params.metric),
      aggFunc: aggFuncs.find(({ id }) => id === params.aggFunc),
      dateStart: new Date(params.date_from),
      dateEnd: new Date(params.date_to),
      hours: JSON.parse(`[${params.hours.slice(1, -1)}]`),
    })),
  );
  /**
   * Gets an observable data from right filter based on the query parameters.
   */
  public rightFilter = this.dataService.queryParams.pipe(
    filter(isValid),
    map((data) => data['right']),
    map(({ params }) => ({
      metric: metrics.find(({ id }) => id === params.metric),
      aggFunc: aggFuncs.find(({ id }) => id === params.aggFunc),
      dateStart: new Date(params.date_from),
      dateEnd: new Date(params.date_to),
      hours: JSON.parse(`[${params.hours.slice(1, -1)}]`),
    })),
  );

  /**
   * An observable which emmits three extras observables **(lines, summary and exportableData)** which contains
   * the full state specified by the left filter.
   */
  public leftMap = this.dataService.leftData.pipe(map((data) => data['map']));
  /**
   * An observable which emmits three extras observables **(lines, summary and exportableData)** which contains
   * the full state specified by the right filter.
   */
  public rightMap = this.dataService.rightData.pipe(map((data) => data['map']));

  /**
   * Gets the difference between the data between the results of the left and right filters.
   * @type {Observable<{type: string, label: string, difference: number}[] | null>}
   */
  public mapDifferences = combineLatest([
    this.leftChart,
    this.rightChart,
    this.dataService.leftData.pipe(
      filter(isValid),
      switchMap((data) => data.map.summary),
    ),
    this.dataService.rightData.pipe(
      filter(isValid),
      switchMap((data) => data.map.summary),
    ),
  ]).pipe(
    map(([leftChart, rightChart, leftData, rightData]) =>
      leftChart.id === 'map' && rightChart.id === 'map'
        ? [
            {
              type: 'delay',
              label: 'Demora',
              difference:
                (rightData.delay > leftData.delay ? -1 : 1) *
                (1 - Math.min(rightData.delay, leftData.delay) / Math.max(rightData.delay, leftData.delay)),
            },
            {
              type: 'length',
              label: 'Largo de Cola',
              difference:
                (rightData.length > leftData.length ? -1 : 1) *
                (1 - Math.min(rightData.length, leftData.length) / Math.max(rightData.length, leftData.length)),
            },
            {
              type: 'speed',
              label: 'Velocidad',
              difference:
                (rightData.speed > leftData.speed ? 1 : -1) *
                (Math.max(rightData.speed, leftData.speed) / Math.min(rightData.speed, leftData.speed) - 1),
            },
          ]
        : null,
    ),
  );

  /**
   * Gets the comparison options for chart.js package.
   * @see https://www.chartjs.org/docs/latest/general/options.html
   */
  public comparisonOptions: any = {
    responsive: true,
    scales: {
      y: {
        ticks: {
          display: false,
        },
      },
      x: {
        ticks: {
          min: -1,
          max: 1,
          callback: (value: any, _index: any, _ticks: any) =>
            (Number(value) * 100).toLocaleString('es-ar', { maximumFractionDigits: 0 }) + '%',
        },
      },
    },
  };

  /**
   * Gets the left bar data
   */
  private leftBarData = this.dataService.leftData.pipe(
    filter(isValid),
    switchMap(({ bar }) => bar.data),
    shareReplay(1),
  );
  /**
   * Gets the right bar data
   */
  private rightBarData = this.dataService.rightData.pipe(
    filter(isValid),
    switchMap(({ bar }) => bar.data),
    shareReplay(1),
  );
  /**
   * Verify if the bar has the same maximum values
   * @type {BehaviorSubject<boolean>}
   */
  public barSameMaximum = new BehaviorSubject(false);
  /**
   * Checks if the bar has the same maximum values
   * @type {Observable<number | undefined>}
   */
  public barMaximum = combineLatest([this.leftBarData, this.rightBarData, this.barSameMaximum]).pipe(
    map(([leftBarData, rightBarData, sameMaximum]) =>
      sameMaximum
        ? Math.max(...[leftBarData, rightBarData].map(({ dataset }) => dataset.map((v) => v.data).flat()).flat())
        : undefined,
    ),
    startWith(undefined),
  );
  /**
   * Gets the left bar **(Evolutivo)** configuration.
   */
  public leftBarConfig = combineLatest([this.leftBarData, this.barMaximum]).pipe(
    map(([{ dataset, labels, unit }, barMaximum]) => ({
      options: this.getOptions('bar', dataset.length, !isNaN(Number(labels[0])), unit, barMaximum),
      colors: this.getColors('bar', dataset.length),
    })),
  );
  /**
   * Get the right bar **(Evolutivo)** configuration.
   */
  public rightBarConfig = combineLatest([this.rightBarData, this.barMaximum]).pipe(
    map(([{ dataset, labels, unit }, barMaximum]) => ({
      options: this.getOptions('bar', dataset.length, !isNaN(Number(labels[0])), unit, barMaximum),
      colors: this.getColors('bar', dataset.length),
    })),
  );

  /**
   * Gets the line-with-map **(Predictivo)** configuration.
   */
  public lineWithMapDataConfig = this.dataService.leftData.pipe(
    filter(isValid),
    switchMap((x) => x['line-with-map'].data),
    map(({ dataset, labels, unit }) => ({
      options: this.getOptions('line-with-map', dataset.length, !isNaN(Number(labels[0])), unit),
      colors: this.getColors('line-with-map', dataset.length),
    })),
  );

  /**
   * Gets the first greater year, if there is no greater year or is invalid returns the current year.
   * @type {Observable<number>}
   */
  public initialGreaterDate = this.activatedRoute.queryParams.pipe(
    take(1),
    map((p) => (p['greaterDate'] ? Number(p['greaterDate']) : new Date().getFullYear())),
  );
  /**
   * Array of numbers which represent the separator keys codes.
   * @type {number[]}}
   */
  public separatorKeysCodes: number[] = [ENTER, COMMA];
  /**
   * A comparative street search form control array containing the different streets search of each filter state.
   * @type {FormControl<never[] | null>}
   */
  public comparativeStreetSearch = new FormControl([]);
  /**
   * A subject which contains the selected comparative charts strings arrays, which will be used to display the
   * datasets at the browser window.
   * @type {Subject<string[]>}
   */
  public selectedComparativeCharts = new Subject<string[]>();
  /**
   * An observable string array which is being merged between the data from data service and the query parameters,
   * it contains the selected streets to compare the name values and use them to compare against another data
   * source.
   * @type {Observable<string[]>}
   */
  public selectedComparativeCharts$ = merge(
    combineLatest([this.dataService.streets.pipe(take(1)), this.activatedRoute.queryParams.pipe(take(1))]).pipe(
      map(([streets, p]) =>
        (JSON.parse(p['comparativeStreetsIds'] || '[]') as number[]).map((id) => streets[id].name),
      ),
    ),
    this.selectedComparativeCharts,
  ).pipe(shareReplay(1));
  /**
   * An observable string array which contains all the actual valid streets names to be compared against another
   * year.
   * @type {Observable<string[]>}
   */
  public selectableComparativeCharts = combineLatest([
    this.dataService.leftData.pipe(
      filter(isValid),
      map((data) => data['line']),
    ),
    this.selectedComparativeCharts$.pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))),
    this.comparativeStreetSearch.valueChanges.pipe(startWith('')) as Observable<string>,
  ]).pipe(
    map(([data, selected, search]) =>
      data
        .map(({ name }) => name)
        .filter((name) => !selected.includes(name) && normalizeString(name).includes(search)),
    ),
  );
  /**
   * An observable that emits an array of results for each selected street by name, the data to be compared and
   * finally the exportable data.
   */
  public comparativeCharts = combineLatest([
    this.dataService.leftData.pipe(
      filter(isValid),
      map((data) => data['line']),
    ),
    this.selectedComparativeCharts$.pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))),
    this.dataService.streets,
  ]).pipe(
    map(([data, selected, streets]) => {
      const streetIds = Object.values(streets)
        .filter(({ name }) => selected.includes(name))
        .map(({ id }) => id);
      this.changeUrl({ comparativeStreetsIds: JSON.stringify(streetIds) });
      return data.filter(({ name }) => selected.includes(name));
    }),
    shareReplay(1),
  );
  /**
   * FIXME: Dynamic minimum year
   * An array of years which should contains a dynamic way to calculate the minimum year.
   * @type {number[]}
   */
  public years = range(new Date().getFullYear() + 1 - 2021).map((v) => new Date().getFullYear() - v);
  /**
   * A boolean which indicates whether the comparative should actually pick the latest available date.
   * @type {BehaviorSubject<boolean>}
   */
  public comparativeSameMaximum = new BehaviorSubject(false);
  /**
   * An observable configuration which will get the best comparative configuration for the based on the latest
   * date or year available.
   */
  public comparativeConfig = this.comparativeCharts.pipe(
    filter(isValid),
    filter((charts) => charts.length > 0),
    switchMap((charts) =>
      combineLatest([combineLatest(charts.map((a) => a.data)), this.comparativeSameMaximum]).pipe(
        map(([datasets, sameMaximum]) => {
          const { labels, unit } = datasets[0];
          const max = sameMaximum
            ? Math.max(...datasets.map(({ dataset }) => dataset.map((v) => v.data).flat()).flat())
            : undefined;
          return {
            options: this.getOptions('line', charts.length, !isNaN(Number(labels[0])), unit, max),
            colors: this.getColors('line', charts.length),
          };
        }),
      ),
    ),
  );

  /**
   * An observable that emits the left filter exportable data, if there is any valid data available, the browser
   * will allow the user to switch the panel data, both left to right and right to left. Also this feature is
   * useful for downloading all the data to a CSV **(Comma Separated Values)** file.
   */
  public leftExportableData = combineLatest([this.leftChart, this.dataService.leftData]).pipe(
    switchMap(([chart, leftData]) => {
      let obs: Observable<any[]>;
      if (chart.id === 'line') {
        obs = this.comparativeCharts.pipe(
          switchMap((charts) => combineLatest(charts.map(({ exportableData }) => exportableData))),
          map((data) => data.flat()),
        );
      } else {
        obs = leftData[chart.id].exportableData;
      }
      return obs.pipe(
        startWith([] as any[]),
        map((csvData) => ({ csvData, chart })),
      );
    }),
  );
  /**
   * An observable that emits the right filter exportable data, if there is any valid data available, the browser
   * will allow the user to switch the panel data, both left to right and right to left. Also this feature is
   * useful for downloading all the data to a CSV **(Comma Separated Values)** file.
   */
  public rightExportableData = combineLatest([this.rightChart, this.dataService.rightData]).pipe(
    switchMap(([chart, data]) =>
      (data[chart.id as 'map' | 'bar'].exportableData as Observable<any[]>).pipe(
        startWith([] as any[]),
        map((csvData) => ({ csvData, chart })),
      ),
    ),
  );

  constructor(
    public userService: UserService,
    public dataService: DataService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
  ) {}

  public ngAfterViewInit() {
    combineLatest([this.charts.changes, this.leftChart, this.rightChart])
      .pipe(debounceTime(100))
      .subscribe(() => {
        this.charts.map(({ chart }) => chart?.resize());
      });
  }

  /**
   * Gets the colors for each chart accordingly.
   * @param {ChartType} type A string describing the type of chart to get the colors for. The values are one of
   * the following values ("map" = "Mapa", "bar" = "Evolutivo", "line" = "Comparativo",
   * "line-with-map" = "Predictivo")
   *
   * @param datasetLength The amount of data from the dataset, if there is at least one record, the density will be
   * assigned to the alpha color value (also known as **transparency**) using a fixed value.
   * @returns {[{backgroundColor: string, borderColor: string}]}}
   */
  private getColors(type: ChartType, datasetLength: number) {
    const dense = datasetLength === 0 ? 0 : { map: 0, bar: 1, line: 0.2, 'line-with-map': 0 }[type];
    return [
      { backgroundColor: `rgba(77,83,96,${dense})`, borderColor: 'rgba(77,83,96,1)' },
      { backgroundColor: `rgba(255,0,0,${dense})`, borderColor: 'red' },
    ];
  }

  /**
   * Gets the options for chart.js package.
   * @see https://www.chartjs.org/docs/latest/general/options.html
   * @param {ChartType} type The type of chart which will be displayed. ("map" = "Mapa", "bar" = "Evolutivo",
   * "line" = "Comparativo", "line-with-map" = "Predictivo")
   * @param {number} datasetLength The number which represents the amount of data to display.
   * @param {boolean} isNumber A boolean indicating whether the chart label is a number.
   * @param {string} unit The unit of the chart to display as string. Checkout 'metrics' at chartTypes.ts file for more
   * information
   * @param {number?} max The suggested maximum numeric value to display in the chart. If not specified the chart will display
   * the default max value according to chart.js documentation.
   * @returns {responsive: boolean, maintainAspectRatio: boolean, scales: {y: {title {display: boolean, text: string, padding: number, fontSize: number}, ticks: {suggestedMax: number, beginAtZero: boolean, maxTicksLimit: number | undefined, callback: (v: number) => string},}, x: {title: {display: boolean, text: string, padding: number, fontSize: number}}}}
   * The options object which contains the data for the specified chart.
   */
  private getOptions(type: ChartType, datasetLength: number, isNumber: boolean, unit: string, max?: number) {
    const xLabel = type === 'line' ? 'Mes' : isNumber ? 'Hora' : 'Día';
    return {
      responsive: true,
      maintainAspectRatio: type === 'line' ? true : datasetLength > 4,
      scales: {
        y: {
          title: { display: true, text: `[ ${unit} ]`, padding: 0, fontSize: 16 },
          ticks: {
            suggestedMax: max,
            beginAtZero: true,
            maxTicksLimit: datasetLength > 4 ? 5 : undefined,
            callback: (v: number) =>
              v.toLocaleString('es-ar', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
          },
        },
        x: { title: { display: true, text: `[ ${xLabel} ]`, padding: 0, fontSize: 16 } },
      },
    };
  }

  /**
   * Add the option to display the administrator panel to the browser only if the current user token is valid and
   * it's an administrator user account.
   * @param {boolean} showUsers A boolean indicating whether the users account list should be shown.
   */
  public toggleUsers(showUsers: boolean) {
    this.changeUrl({ showUsers });
  }

  /**
   * Add the option to display the comparison panel to the browser, making possible to compare two different
   * filters at the same time.
   * @param {boolean} compare A boolean value indicating whether to display the comparison panel and their
   * associated statistics.
   */
  public toggleCompare(compare: boolean) {
    this.changeUrl({ compare });
  }

  /**
   * A reset filters function to reset each filter to a clean state.
   */
  public resetFilters() {
    return this.router.navigate(['/'], {
      queryParams: {},
    });
  }

  /**
   * A function which is used to update the filters by modifying the url and updating each filter state
   * accordingly.
   * @param {{[key: string]: any}} value All the entries which should be updated.
   * @returns
   */
  private changeUrl(value: { [key: string]: any }) {
    return this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { ...value },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Gets the units string name from the metrics chart type system.
   * @param {string} key The name of the metric key type. The values must be one of the following options:
   * - "speed"
   * - "delay"
   * - "length"
   * @returns {string} The measurement unit name according to the key parameter based on the metric definition. To
   * get more information about the units and the key parameters, please checkout the chartTypes.ts file.
   */
  public getUnit = (key: string) => metrics.find(({ id }) => id === key)?.unit;

  /**
   * Gets a string representation of multiple hours specified as a numeric array values.
   * @param {number[]} times An array of numbers which represent several hours.
   * @returns {string} A string representation of several hours with 'hs' suffix and split by a comma delimiter.
   * @example
   * ```ts
   * getHoursString([17, 18, 19])
   * // returns '17hs, 18hs, 19hs'
   * ```
   */
  public getHoursString = (times: number[]) => times.map((value) => `${value}hs`).join(', ');

  /**
   * Gets a boolean value indicating whether the specified data chart dataset contains a valid label value.
   * @param {ChartDataset[]} data The specified data chart dataset array which contains the label value as well as
   * the data number array.
   * @returns {boolean} Returns true if the specified data chart dataset contains a valid label value.
   */
  public showLabels = (data: ChartDataset[]) => data.some((v) => !!v.label);

  /**
   * A function which is used to update the "line" chart **(Comparativo)** by modifying the url and updating
   * the filter state accordingly.
   * @param {number} greaterDate The date to update the query parameters.
   * @returns {Promise<boolean>} Returns a promise that resolves to true when navigation succeeds, to false when
   * navigation fails, or is rejected on error.
   */
  public async selectLineYear(greaterDate: number) {
    return this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { greaterDate },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Toggles the comparative chart, if it doesn't exists already and the action is called as 'add' then generate
   * the comparative chart type by the **chart** string value into the **selectedComparativeCharts** array of
   * strings property.
   * @param {'add' | 'delete'} action A string representing the action to be executed, e.g. 'add' or 'delete'.
   * @param {string} chart The chart to toggle to display in the browser window.
   * @param {string[]} selected An array of strings representing the selected charts at the
   * **selectedComparativeCharts** array.
   * @param {HTMLInputElement?} input The input element to clear the comparative selection if necessary.
   */
  public toggleComparativeChart(
    action: 'add' | 'delete',
    chart: string,
    selected: string[],
    input?: HTMLInputElement,
  ) {
    const selectedComparativeCharts = selected.slice(0);
    const index = selectedComparativeCharts.indexOf(chart);
    if (action === 'add' && index === -1) selectedComparativeCharts.push(chart);
    if (action === 'delete' && index >= 0) selectedComparativeCharts.splice(index, 1);
    this.selectedComparativeCharts.next(selectedComparativeCharts);
    if (input) {
      input.value = '';
      this.comparativeStreetSearch.setValue('' as never);
      input.blur();
      // setTimeout(() => input.focus(), 10);
    }
  }
}
