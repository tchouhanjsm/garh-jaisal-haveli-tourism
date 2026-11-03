#!/usr/bin/env python3
"""Parse CMS YAML into JSON while rejecting ambiguous or unsupported YAML features."""
import json
import sys

import yaml
from yaml.nodes import MappingNode, ScalarNode, SequenceNode
from yaml.tokens import AliasToken, AnchorToken, DirectiveToken, KeyToken, TagToken


MAX_CONFIG_BYTES = 2 * 1024 * 1024


class StrictYamlError(Exception):
    def __init__(self, message, duplicate_paths=None):
        super().__init__(message)
        self.duplicate_paths = duplicate_paths or []


def convert_node(node, path, duplicate_paths):
    if isinstance(node, ScalarNode):
        return node.value

    if isinstance(node, SequenceNode):
        return [
            convert_node(child, "{}[{}]".format(path, index), duplicate_paths)
            for index, child in enumerate(node.value)
        ]

    if isinstance(node, MappingNode):
        result = {}
        for key_node, value_node in node.value:
            if not isinstance(key_node, ScalarNode):
                raise StrictYamlError(
                    "non-scalar YAML mapping keys are unsupported at line {}".format(
                        key_node.start_mark.line + 1
                    )
                )

            key = key_node.value
            if not isinstance(key, str):
                raise StrictYamlError(
                    "YAML mapping keys must be strings at line {}".format(
                        key_node.start_mark.line + 1
                    )
                )
            child_path = "{}.{}".format(path, key)
            if key == "<<" and key_node.style is None:
                raise StrictYamlError(
                    "YAML merge keys are unsupported at line {}".format(
                        key_node.start_mark.line + 1
                    )
                )

            if key in result:
                duplicate_paths.append(child_path)
                convert_node(value_node, child_path, duplicate_paths)
                continue

            result[key] = convert_node(value_node, child_path, duplicate_paths)
        return result

    raise StrictYamlError(
        "unsupported YAML node at line {}".format(node.start_mark.line + 1)
    )


def parse_config(source):
    for token in yaml.scan(source, Loader=yaml.BaseLoader):
        line = token.start_mark.line + 1
        if isinstance(token, AliasToken):
            raise StrictYamlError("YAML aliases are unsupported at line {}".format(line))
        if isinstance(token, AnchorToken):
            raise StrictYamlError("YAML anchors are unsupported at line {}".format(line))
        if isinstance(token, TagToken):
            raise StrictYamlError("YAML tags are unsupported at line {}".format(line))
        if isinstance(token, DirectiveToken):
            raise StrictYamlError("YAML directives are unsupported at line {}".format(line))
        if isinstance(token, KeyToken):
            token_text = source[token.start_mark.index:token.end_mark.index]
            if token_text == "?":
                raise StrictYamlError(
                    "explicit YAML mapping keys are unsupported at line {}".format(line)
                )

    documents = list(yaml.compose_all(source, Loader=yaml.BaseLoader))
    if len(documents) != 1:
        raise StrictYamlError("CMS config must contain exactly one YAML document")
    if not isinstance(documents[0], MappingNode):
        raise StrictYamlError("CMS config root must be a mapping")

    duplicate_paths = []
    data = convert_node(documents[0], "$", duplicate_paths)
    if duplicate_paths:
        unique_paths = sorted(set(duplicate_paths))
        raise StrictYamlError(
            "duplicate YAML mapping keys: " + ", ".join(unique_paths),
            unique_paths
        )
    return data


def main():
    raw = sys.stdin.buffer.read(MAX_CONFIG_BYTES + 1)
    if len(raw) > MAX_CONFIG_BYTES:
        raise StrictYamlError("CMS config exceeds the 2 MiB parser limit")
    try:
        source = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise StrictYamlError("CMS config must be valid UTF-8: {}".format(error))

    data = parse_config(source)
    if not isinstance(data, dict):
        raise StrictYamlError("CMS config root must be a mapping")
    return {"ok": True, "data": data}


if __name__ == "__main__":
    try:
        response = main()
    except (StrictYamlError, yaml.YAMLError) as error:
        response = {
            "ok": False,
            "error": str(error),
            "duplicatePaths": getattr(error, "duplicate_paths", []),
        }
        json.dump(response, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        sys.exit(1)

    json.dump(response, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
