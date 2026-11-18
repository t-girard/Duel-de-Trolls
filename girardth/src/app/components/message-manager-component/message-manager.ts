import { Component, inject } from '@angular/core';
import { MessageService } from '../../services/message-service';

@Component({
  imports: [],
  selector: 'app-message-manager-component',
  styleUrl: './message-manager.css',
  templateUrl: './message-manager.html',
})

export class MessageManager {
  protected messageService = inject(MessageService);
}
