import { importDocument } from "./document.ts";
import { importScenes, relativePath } from "./scene-import.ts";

type ImportProgress = {
  name: string;
  kind: "document" | "maps";
  status: "pending" | "working" | "done" | "error";
  created: number;
  failed: number;
  items: number;
  pulp: number;
  done?: number;
  total?: number;
  journals?: number;
  handouts?: number;
  tokens?: number;
  documents?: number;
  error?: string;
};

export class PdfImporterConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    id: "coc-pdf-importer-settings",
    tag: "form",
    window: {
      title: "coc-pdf-importer.Settings.Name",
      contentClasses: ["standard-form"],
    },
    form: {
      closeOnSubmit: false,
      handler: PdfImporterConfig.#onSubmit,
    },
    position: {
      width: 550,
    },
  };

  static PARTS = {
    form: {
      template: "modules/coc-pdf-importer/templates/pdf-importer.hbs",
      scrollable: [""],
    },
    progress: {
      template: "modules/coc-pdf-importer/templates/import-progress.hbs",
    },
    footer: {
      template: "templates/generic/form-footer.hbs",
    },
  };

  #importing = false;
  #progress: ImportProgress[] = [];

  _prepareContext(options: object) {
    const totalCreated = this.#progress
      .filter((p) => p.kind === "document")
      .reduce((n, p) => n + p.created, 0);
    return {
      importing: this.#importing,
      progress: this.#progress.map((p) => ({
        name: p.name,
        status: p.status,
        label: this.#statusLabel(p),
      })),
      totalLabel: game.i18n.format("coc-pdf-importer.Progress.Total", {
        created: totalCreated,
      }),
      buttons: [
        {
          type: "submit",
          icon: this.#importing
            ? "fa-solid fa-spinner fa-spin"
            : "fa-solid fa-upload",
          label: this.#importing
            ? "coc-pdf-importer.Progress.Working"
            : "coc-pdf-importer.Settings.Label",
          disabled: this.#importing,
        },
      ],
    };
  }

  static async #onSubmit(
    event: Event,
    form: HTMLFormElement,
    formData: object,
  ) {
    const picked = (name: string) =>
      Array.from(
        form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.files ??
          [],
      );
    const files = picked("files");
    const maps = picked("maps");
    if (files.length === 0 && maps.length === 0) {
      ui.notifications.error(
        game.i18n.localize("coc-pdf-importer.Errors.NoFiles"),
      );
      return;
    }
    await this.runImport(files, maps);
  }

  // Import each document in turn, then the picked folder of maps, re-rendering
  // the progress list and the (disabled) submit button between steps so the
  // dialog reflects live status.
  async runImport(files: File[], maps: File[] = []) {
    this.#importing = true;
    this.#progress = files.map(
      (f): ImportProgress => ({
        name: f.name,
        kind: "document",
        status: "pending",
        created: 0,
        failed: 0,
        items: 0,
        pulp: 0,
      }),
    );
    if (maps.length)
      this.#progress.push({
        name: relativePath(maps[0]).split("/")[0] || maps[0].name,
        kind: "maps",
        status: "pending",
        created: 0,
        failed: 0,
        items: 0,
        pulp: 0,
      });
    await this.render({ parts: ["progress", "footer"] });

    for (let i = 0; i < files.length; i++) {
      const entry = this.#progress[i];
      entry.status = "working";
      await this.render({ parts: ["progress"] });
      try {
        const folderName = files[i].name.replace(/\.[^.]+$/, "");
        const result = await importDocument(
          new Uint8Array(await files[i].arrayBuffer()),
          { folderName, notify: false },
        );
        entry.status = "done";
        entry.created = result.actors.created;
        entry.failed = result.actors.failed;
        entry.items = result.items.created;
        entry.pulp = result.actors.pulp;
      } catch (e) {
        entry.status = "error";
        entry.error = e instanceof Error ? e.message : String(e);
      }
      await this.render({ parts: ["progress"] });
    }

    if (maps.length) {
      const entry = this.#progress[this.#progress.length - 1];
      entry.status = "working";
      await this.render({ parts: ["progress"] });
      try {
        const result = await importScenes(maps, {
          skipDocuments: files.map((f) => f.name),
          onProgress: (done, total) => {
            entry.done = done;
            entry.total = total;
            if (done % 10 === 0 || done === total)
              void this.render({ parts: ["progress"] });
          },
        });
        entry.status = "done";
        entry.created = result.created;
        entry.failed = result.failed;
        entry.journals = result.journals;
        entry.handouts = result.handouts;
        entry.documents = result.documents;
        entry.tokens = result.tokens;
      } catch (e) {
        entry.status = "error";
        entry.error = e instanceof Error ? e.message : String(e);
      }
      await this.render({ parts: ["progress"] });
    }

    this.#importing = false;
    await this.render({ parts: ["progress", "footer"] });
  }

  #statusLabel(p: ImportProgress): string {
    switch (p.status) {
      case "working":
        return p.kind === "maps" && p.total
          ? game.i18n.format("coc-pdf-importer.Progress.ScenesWorking", {
              done: p.done ?? 0,
              total: p.total,
            })
          : game.i18n.localize("coc-pdf-importer.Progress.Working");
      case "done": {
        if (p.kind === "maps") {
          const scenes = p.failed
            ? game.i18n.format("coc-pdf-importer.Progress.ScenesWithErrors", {
                created: p.created,
                failed: p.failed,
              })
            : game.i18n.format("coc-pdf-importer.Progress.Scenes", {
                created: p.created,
              });
          const extras = [
            p.handouts ? `${p.handouts} handouts in ${p.journals} journals` : "",
            p.tokens ? `${p.tokens} actor tokens` : "",
            p.documents ? `${p.documents} documents` : "",
          ].filter(Boolean);
          return extras.length ? `${scenes} (+${extras.join(", +")})` : scenes;
        }
        const base = p.failed
          ? game.i18n.format("coc-pdf-importer.Progress.CreatedWithErrors", {
              created: p.created,
              failed: p.failed,
            })
          : game.i18n.format("coc-pdf-importer.Progress.Created", {
              created: p.created,
            });
        const extras = [
          p.pulp ? `${p.pulp} pulp` : "",
          p.items ? `${p.items} items` : "",
        ].filter(Boolean);
        return extras.length ? `${base} (+${extras.join(", +")})` : base;
      }
      case "error":
        return game.i18n.format("coc-pdf-importer.Errors.ErrorProcessing", {
          error: p.error ?? "",
        });
      default:
        return game.i18n.localize("coc-pdf-importer.Progress.Pending");
    }
  }
}
