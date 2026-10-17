#!/usr/bin/env python3
"""Generate the iPhone relay workflow. Sign the output with `shortcuts sign`.

The bundle and team must match the app installed on recipients' phones. No
Bluetooth device identifier is embedded; import questions select each device.
"""

import argparse
import json
from pathlib import Path
import plistlib
import re
import uuid


NAMESPACE = uuid.UUID("961af2b1-f5cc-4fbf-90cb-a9e357d659a9")


def identifier(name):
    return str(uuid.uuid5(NAMESPACE, name)).upper()


def output(name, label, *, text=False):
    value = {"Type": "ActionOutput", "OutputUUID": identifier(name), "OutputName": label}
    if text:
        value["Aggrandizements"] = [
            {"Type": "WFCoercionVariableAggrandizement", "CoercionItemClass": "WFStringContentItem"}
        ]
    return {"Value": value, "WFSerializationType": "WFTextTokenAttachment"}


def build(bundle, team):
    actions = []
    questions = []

    def add(action, name, **parameters):
        parameters["UUID"] = identifier(name)
        actions.append({"WFWorkflowActionIdentifier": action, "WFWorkflowActionParameters": parameters})
        return len(actions) - 1

    def builtin(action, name, **parameters):
        return add("is.workflow.actions." + action, name, **parameters)

    def intent(intent_name, name, **parameters):
        return add(
            bundle + "." + intent_name,
            name,
            AppIntentDescriptor={
                "AppIntentIdentifier": intent_name,
                "BundleIdentifier": bundle,
                "TeamIdentifier": team,
                "Name": "RaveGuard",
            },
            ShowWhenRun=False,
            **parameters,
        )

    def start_if(name, source, value):
        builtin(
            "conditional", name,
            GroupingIdentifier=identifier(name + "-group"),
            WFControlFlowMode=0, WFCondition=4,
            WFInput={"Type": "Variable", "Variable": source},
            WFConditionalActionString=value,
        )

    def end_if(name):
        builtin(
            "conditional", name + "-end",
            GroupingIdentifier=identifier(name + "-group"), WFControlFlowMode=2,
        )

    builtin(
        "comment", "setup",
        WFCommentActionText=(
            "RG Noise Relay — experimental iPhone test.\n"
            "Install the matching RaveGuard build and select YOUR AirPods in both "
            "Set Noise Control Mode actions during import.\n"
            "Start a RaveGuard session with Background relay selected, then run this shortcut. "
            "For automatic startup, create an App → RaveGuard → Is Opened automation, "
            "Run Immediately → Run Shortcut → RG Noise Relay.\n"
            "Checks every 2 seconds for up to 1800 repetitions. iOS may stop it earlier. "
            "This file has not yet passed a physical iPhone/AirPods test."
        ),
    )
    intent("BeginNoiseRelayIntent", "begin")
    relay = output("begin", "Relay", text=True)
    # An absent runtime returns an empty relay. Exit before sending any commands.
    start_if("empty-relay", relay, "")
    builtin("exit", "no-runtime-exit")
    end_if("empty-relay")

    builtin(
        "repeat.count", "repeat-start", WFRepeatCount=1800,
        WFControlFlowMode=0, GroupingIdentifier=identifier("repeat-group"),
    )
    intent("NextNoiseCommandIntent", "next", relay=relay)
    builtin("detect.dictionary", "dictionary", WFInput=output("next", "Noise Command"))
    command = output("dictionary", "Command")
    builtin(
        "getvalueforkey", "action", WFGetDictionaryValueType="Value",
        WFDictionaryKey="action", WFInput=command,
    )
    action = output("action", "Action", text=True)
    start_if("stop", action, "stop")
    builtin("exit", "stop-exit")
    end_if("stop")

    for command_name, mode in (("adaptive", "Adaptive"), ("noiseCancellation", "ActiveNoiseCancellation")):
        start_if(command_name, action, command_name)
        index = builtin(
            "listeningmode.set", command_name + "-mode", WFListeningMode=mode,
        )
        # Keep WFRoute absent until the recipient chooses their AirPods. Do not
        # serialize Ask Each Time: a prompt inside the polling loop breaks it.
        questions.append({
            "ActionIndex": index, "Category": "Parameter", "ParameterKey": "WFRoute",
            "Text": "Select your connected AirPods for " + (
                "Adaptive mode." if command_name == "adaptive" else "Noise Cancellation. Choose the same AirPods."
            ),
        })
        builtin(
            "getvalueforkey", command_name + "-request", WFGetDictionaryValueType="Value",
            WFDictionaryKey="request", WFInput=command,
        )
        # Default Shortcuts error handling stops the workflow if the Apple mode
        # action fails. Acknowledgement only follows a successful mode action.
        intent(
            "AcknowledgeNoiseCommandIntent", command_name + "-ack", relay=relay,
            request=output(command_name + "-request", "Request", text=True),
        )
        end_if(command_name)

    builtin("delay", "wait", WFDelayTime=2)
    builtin(
        "repeat.count", "repeat-end", WFControlFlowMode=2,
        GroupingIdentifier=identifier("repeat-group"),
    )
    return {
        "WFWorkflowName": "RG Noise Relay",
        "WFWorkflowClientVersion": "4018.0.4",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 61440, "WFWorkflowIconStartColor": 946986751},
        "WFWorkflowActions": actions,
        "WFWorkflowImportQuestions": questions,
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
    }


def validate(workflow, bundle, metadata=None):
    """Catch broken references, branches, device setup, and intent signatures."""
    stack = []
    seen = set()
    actions = workflow["WFWorkflowActions"]
    expected_intents = {
        "BeginNoiseRelayIntent": set(),
        "NextNoiseCommandIntent": {"relay"},
        "AcknowledgeNoiseCommandIntent": {"relay", "request"},
    }

    def references(value):
        if isinstance(value, dict):
            if value.get("Type") == "ActionOutput":
                assert value["OutputUUID"] in seen, "Reference to an unavailable action output"
            for item in value.values():
                references(item)
        elif isinstance(value, list):
            for item in value:
                references(item)

    for action in actions:
        key, p = action["WFWorkflowActionIdentifier"], action["WFWorkflowActionParameters"]
        references(p)
        assert p["UUID"] not in seen, "Duplicate action UUID"
        seen.add(p["UUID"])
        if "WFControlFlowMode" in p:
            pair = (key, p["GroupingIdentifier"])
            if p["WFControlFlowMode"] == 0:
                stack.append(pair)
            else:
                assert p["WFControlFlowMode"] == 2 and stack.pop() == pair, "Unbalanced control flow"
        assert not any(s in key for s in ("openapp", "openurl", "runworkflow", "getcontents")), key
        if key.startswith(bundle + "."):
            intent_name = p["AppIntentDescriptor"]["AppIntentIdentifier"]
            required = expected_intents[intent_name]
            actual = set(p) - {"UUID", "AppIntentDescriptor", "ShowWhenRun"}
            assert actual == required, "Incorrect App Intent inputs"
            if metadata is not None:
                definition = metadata["actions"][intent_name]
                assert not definition["openAppWhenRun"], "Intent would open the app"
                assert {x["name"] for x in definition["parameters"]} == required
    assert not stack, "Unclosed branch/loop"
    for question in workflow["WFWorkflowImportQuestions"]:
        target = actions[question["ActionIndex"]]
        assert target["WFWorkflowActionIdentifier"] == "is.workflow.actions.listeningmode.set"
        assert question["ParameterKey"] == "WFRoute"
    assert len(workflow["WFWorkflowImportQuestions"]) == 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--team-id", required=True)
    parser.add_argument("--metadata", type=Path, help="Installed build's extract.actionsdata for signature validation")
    parser.add_argument("--format", choices=("binary", "xml"), default="binary")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", args.bundle_id):
        parser.error("Invalid bundle ID")
    if not re.fullmatch(r"[A-Z0-9]{10}", args.team_id):
        parser.error("Team ID must contain 10 uppercase letters/digits")
    workflow = build(args.bundle_id, args.team_id)
    metadata = json.loads(args.metadata.read_text()) if args.metadata else None
    validate(workflow, args.bundle_id, metadata)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    format_ = plistlib.FMT_XML if args.format == "xml" else plistlib.FMT_BINARY
    args.output.write_bytes(plistlib.dumps(workflow, fmt=format_, sort_keys=False))
    assert plistlib.loads(args.output.read_bytes()) == workflow
    print(f"Wrote {args.output}: {len(workflow['WFWorkflowActions'])} actions, two AirPods setup questions.")


if __name__ == "__main__":
    main()
