import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { HardwarePromoService } from '../../services/hardware-promo.service';
import { ProjectService } from '../../services/project.service';

@Component({
  selector: 'lib-project-share',
  templateUrl: './project-share.component.html',
  styleUrls: ['./project-share.component.css'],
  standalone: false,
})
export class ProjectShareComponent implements OnInit {
  shareLink: string;
  promoLink: string;

  // a project the server stored without a share token has no link to share (it would read
  // token=undefined): saving it gives it one
  hasShareToken = false;

  // has the link been copied?
  copied = false;

  @ViewChild('shareLinkInput') shareLinkInput: ElementRef<HTMLInputElement>;

  constructor(
    public bsModalRef: BsModalRef,
    private projectService: ProjectService,
    public hardwarePromoService: HardwarePromoService,
    private changeDetectorRef: ChangeDetectorRef
  ) {
    this.promoLink = this.hardwarePromoService.link('share');
  }

  ngOnInit() {
    const project = this.projectService.project;

    this.hasShareToken = !!project.shareToken;
    this.shareLink = window.location.origin + '/designer/app?id=' + project.id + '&token=' + project.shareToken;
  }

  // the link only works as a whole, so it is selected as a whole
  selectShareLink() {
    this.shareLinkInput.nativeElement.select();
  }

  copyShareLink() {
    this.selectShareLink();

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(this.shareLink).then(
        () => this.showCopied(true),
        () => this.copySelection()
      );
    } else {
      this.copySelection();
    }
  }

  // the browser doesn't hand out the clipboard (e.g. on a page without https) -> copy the
  // selected link the old way
  private copySelection() {
    this.showCopied(document.execCommand('copy'));
  }

  // the clipboard answers after the click has been handled, so the button is told itself
  private showCopied(copied: boolean) {
    this.copied = copied;
    this.changeDetectorRef.detectChanges();
  }

  ok() {
    this.bsModalRef.hide();
  }

  cancel() {
    this.bsModalRef.hide();
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    this.ok();
  }
}
