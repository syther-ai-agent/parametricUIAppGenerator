#!/usr/bin/env python3

import json
import os
import shutil
import sys
import traceback

import FreeCAD
import Import
import Mesh


def ensure_parent(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def export_objects_for_doc(doc):
    bodies = [obj for obj in doc.Objects if getattr(obj, "TypeId", "") == "PartDesign::Body" and hasattr(obj, "Shape") and not obj.Shape.isNull()]
    if bodies:
        return bodies

    visible_shapes = []
    for obj in doc.Objects:
        if not hasattr(obj, "Shape"):
            continue
        try:
            if obj.Shape.isNull():
                continue
        except Exception:
            continue
        if getattr(obj, "TypeId", "").startswith("App::"):
            continue
        if getattr(obj, "TypeId", "") == "Sketcher::SketchObject":
            continue
        visible_shapes.append(obj)
    return visible_shapes


def load_fcstd(payload):
    doc = FreeCAD.openDocument(payload["modelPath"])
    spreadsheet_name = payload.get("spreadsheetName")
    if spreadsheet_name:
        sheet = doc.getObject(spreadsheet_name)
        if sheet is None:
            raise RuntimeError(f'Spreadsheet "{spreadsheet_name}" not found in document.')
        for key, value in payload.get("parameters", {}).items():
            if isinstance(value, bool):
                normalized = "true" if value else "false"
            else:
                normalized = str(value)
            sheet.set(key, normalized)
    doc.recompute()
    return doc


def load_step(payload):
    doc = FreeCAD.newDocument("StepProject")
    Import.insert(payload["modelPath"], doc.Name)
    doc.recompute()
    return doc


def export_format(doc, fmt, output_path):
    objects = export_objects_for_doc(doc)
    if not objects:
        raise RuntimeError("No exportable geometry was found in the document.")

    ensure_parent(output_path)

    if fmt == "stl":
        Mesh.export(objects, output_path)
        return

    if fmt == "step":
        Import.export(objects, output_path)
        return

    raise RuntimeError(f"Unsupported export format: {fmt}")


def main():
    args = sys.argv[1:]
    if "--pass" in args:
        pass_index = args.index("--pass")
        payload_args = args[pass_index + 1 :]
    else:
        payload_args = args[-2:]

    if len(payload_args) < 2:
        raise RuntimeError("Expected request and response file arguments.")

    request_path = payload_args[0]
    response_path = payload_args[1]

    try:
        with open(request_path, "r", encoding="utf8") as handle:
            payload = json.load(handle)

        project_type = payload["projectType"]
        output_path = payload["outputPath"]
        fmt = payload["format"].lower()

        if project_type == "FCStd":
            doc = load_fcstd(payload)
        elif project_type == "STEP":
            if payload["operation"] == "export" and fmt == "step":
                ensure_parent(output_path)
                shutil.copyfile(payload["modelPath"], output_path)
                result = {"ok": True, "outputPath": output_path}
                with open(response_path, "w", encoding="utf8") as handle:
                    json.dump(result, handle)
                return
            doc = load_step(payload)
        else:
            raise RuntimeError(f"Unsupported project type: {project_type}")

        export_format(doc, fmt, output_path)

        result = {
            "ok": True,
            "outputPath": output_path,
            "previewPath": output_path,
            "format": fmt,
        }
    except Exception as exc:
        result = {
            "ok": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }

    with open(response_path, "w", encoding="utf8") as handle:
        json.dump(result, handle)


main()
