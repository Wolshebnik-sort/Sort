import * as vscode from 'vscode';
import { SortImportsProvider } from './sortImportsProvider';

const SUPPORTED_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'javascriptreact',
  'typescriptreact',
]);

function isSupportedLanguage(languageId: string): boolean {
  return SUPPORTED_LANGUAGES.has(languageId);
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Sort Imports extension is now active!');

  const provider = new SortImportsProvider();

  // Регистрируем команду для сортировки импортов
  const disposable = vscode.commands.registerCommand(
    'sortImports.sortImports',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      const document = editor.document;
      const languageId = document.languageId;

      // Проверяем, что это JS/TS файл
      if (!isSupportedLanguage(languageId)) {
        vscode.window.showErrorMessage(
          'Sort Imports only works with JavaScript and TypeScript files'
        );
        return;
      }

      try {
        const didChange = await provider.sortImports(editor);
        if (didChange) {
          vscode.window.showInformationMessage('Imports sorted successfully!');
        } else {
          vscode.window.showInformationMessage('No import changes were needed.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error sorting imports: ${error}`);
      }
    }
  );

  context.subscriptions.push(disposable);

  const saveSubscription = vscode.workspace.onWillSaveTextDocument((event) => {
    const document = event.document;

    if (!isSupportedLanguage(document.languageId)) {
      return;
    }

    const config = vscode.workspace.getConfiguration('sortImports', document.uri);
    const sortOnSave = config.get<boolean>('sortOnSave', false);
    if (!sortOnSave) {
      return;
    }

    try {
      const edits = provider.getFormattingEdits(document);
      if (edits.length > 0) {
        event.waitUntil(Promise.resolve(edits));
      }
    } catch (error) {
      console.error('Error while sorting imports on save:', error);
    }
  });

  context.subscriptions.push(saveSubscription);

  // Регистрируем провайдер форматирования (опционально)
  const formattingProvider =
    vscode.languages.registerDocumentFormattingEditProvider(
      ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
      {
        provideDocumentFormattingEdits(
          document: vscode.TextDocument
        ): vscode.TextEdit[] {
          try {
            return provider.getFormattingEdits(document);
          } catch (error) {
            console.error('Error in formatting provider:', error);
            return [];
          }
        },
      }
    );

  context.subscriptions.push(formattingProvider);

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
    {
      provideCodeActions(
        document: vscode.TextDocument
      ): vscode.CodeAction[] {
        if (!isSupportedLanguage(document.languageId)) {
          return [];
        }

        const quickFixAction = new vscode.CodeAction(
          'Sort Imports',
          vscode.CodeActionKind.QuickFix
        );
        quickFixAction.command = {
          command: 'sortImports.sortImports',
          title: 'Sort Imports',
        };
        quickFixAction.isPreferred = true;

        const sourceAction = new vscode.CodeAction(
          'Sort Imports',
          vscode.CodeActionKind.Source.append('sortImports')
        );
        sourceAction.command = {
          command: 'sortImports.sortImports',
          title: 'Sort Imports',
        };

        return [quickFixAction, sourceAction];
      },
    },
    {
      providedCodeActionKinds: [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Source.append('sortImports'),
      ],
    }
  );

  context.subscriptions.push(codeActionProvider);
}

export function deactivate() {
  console.log('Sort Imports extension is now deactivated!');
}
