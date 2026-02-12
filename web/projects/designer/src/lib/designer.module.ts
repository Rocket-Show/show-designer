import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { AccordionModule } from 'ngx-bootstrap/accordion';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { TypeaheadModule } from 'ngx-bootstrap/typeahead';
import { DropzoneModule } from 'ngx-dropzone-wrapper';
import { SortablejsModule } from 'ngx-sortablejs-plus';
import { ToastrModule } from 'ngx-toastr';
import { ArraySortPipe } from './array-sort-pipe';
import { DesignerComponent } from './designer.component';
import { EffectCurveComponent } from './effect/effect-curve/effect-curve.component';
import { EffectPanTiltComponent } from './effect/effect-pan-tilt/effect-pan-tilt.component';
import { EffectComponent } from './effect/effect.component';
import { ErrorDialogComponent } from './error-dialog/error-dialog.component';
import { FixturePoolCreateFromFileComponent } from './fixture-pool/fixture-pool-create-from-file/fixture-pool-create-from-file.component';
import { FixturePoolComponent } from './fixture-pool/fixture-pool.component';
import { FixtureCapabilityChannelComponent } from './fixture/fixture-capability/fixture-capability-channel/fixture-capability-channel.component';
import { FixtureCapabilityColorWheelComponent } from './fixture/fixture-capability/fixture-capability-color-wheel/fixture-capability-color-wheel.component';
import { FixtureCapabilityColorComponent } from './fixture/fixture-capability/fixture-capability-color/fixture-capability-color.component';
import { FixtureCapabilityDimmerComponent } from './fixture/fixture-capability/fixture-capability-dimmer/fixture-capability-dimmer.component';
import { FixtureCapabilityPanTiltComponent } from './fixture/fixture-capability/fixture-capability-pan-tilt/fixture-capability-pan-tilt.component';
import { FixtureCapabilityComponent } from './fixture/fixture-capability/fixture-capability.component';
import { FixtureChannelComponent } from './fixture/fixture-channel/fixture-channel.component';
import { FixtureSettingsPositionComponent } from './fixture/fixture-settings/fixture-settings-position/fixture-settings-position.component';
import { FixtureSettingsStageComponent } from './fixture/fixture-settings/fixture-settings-stage/fixture-settings-stage.component';
import { FixtureSettingsComponent } from './fixture/fixture-settings/fixture-settings.component';
import { FixtureComponent } from './fixture/fixture.component';
import { IntroComponent } from './intro/intro.component';
import { MasterDimmerComponent } from './master-dimmer/master-dimmer.component';
import { PresetSettingsComponent } from './preset/preset-settings/preset-settings.component';
import { PresetComponent } from './preset/preset.component';
import { PreviewComponent } from './preview/preview.component';
import { ProjectBrowserComponent } from './project/project-browser/project-browser.component';
import { ProjectImportComponent } from './project/project-import/project-import.component';
import { ProjectSaveComponent } from './project/project-save/project-save.component';
import { ProjectShareComponent } from './project/project-share/project-share.component';
import { SceneSettingsComponent } from './scene/scene-settings/scene-settings.component';
import { SceneComponent } from './scene/scene.component';
import { CompositionSettingsComponent } from './timeline/composition-settings/composition-settings.component';
import { TimelineGridComponent } from './timeline/timeline-grid/timeline-grid.component';
import { TimelineComponent } from './timeline/timeline.component';
import { UserLoginComponent } from './user/user-login/user-login.component';
import { UserRegisterComponent } from './user/user-register/user-register.component';
import { WaitDialogComponent } from './wait-dialog/wait-dialog.component';
import { WarningDialogComponent } from './warning-dialog/warning-dialog.component';
import { DropzoneComponent } from './dropzone/dropzone.component';
import { TreeModule } from '@ali-hm/angular-tree-component';
import { SceneArrangementComponent } from './scene-arrangement/scene-arrangement.component';

@NgModule({
  declarations: [
    DesignerComponent,
    WarningDialogComponent,
    PreviewComponent,
    EffectCurveComponent,
    EffectPanTiltComponent,
    SceneComponent,
    TimelineComponent,
    FixtureCapabilityColorComponent,
    FixtureComponent,
    FixtureSettingsPositionComponent,
    FixtureCapabilityComponent,
    FixtureSettingsComponent,
    EffectComponent,
    FixturePoolComponent,
    PresetComponent,
    SceneArrangementComponent,
    MasterDimmerComponent,
    FixtureCapabilityDimmerComponent,
    TimelineGridComponent,
    CompositionSettingsComponent,
    ArraySortPipe,
    FixtureCapabilityPanTiltComponent,
    FixtureCapabilityChannelComponent,
    FixtureChannelComponent,
    FixtureCapabilityColorWheelComponent,
    UserLoginComponent,
    UserRegisterComponent,
    ProjectBrowserComponent,
    WaitDialogComponent,
    ProjectImportComponent,
    ProjectShareComponent,
    ErrorDialogComponent,
    FixtureSettingsStageComponent,
    IntroComponent,
    PresetSettingsComponent,
    SceneSettingsComponent,
    ProjectSaveComponent,
    FixturePoolCreateFromFileComponent,
    DropzoneComponent,
  ],
  exports: [DesignerComponent],
  imports: [
    RouterModule.forRoot([], {}),
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    NgxBootstrapSliderModule,
    TranslateModule,
    AccordionModule,
    PopoverModule,
    TypeaheadModule,
    SortablejsModule,
    DropzoneModule,
    ToastrModule.forRoot({
      newestOnTop: true,
    }),
    TreeModule,
  ],
  providers: [provideHttpClient(withInterceptorsFromDi())],
})
export class DesignerModule {}
