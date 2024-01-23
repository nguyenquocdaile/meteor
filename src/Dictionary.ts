import { accessSync } from "fs";
import { Color } from "./Color";
import {
  FigmaApi,
  FigmaApiResponse,
  type FigmaVariable,
  type FigmaVariableCollection,
} from "./figmaApi";
import { set } from "./utils/object";

type DictionaryValue = {
  $value: string;

  // TODO: are we able to make a union of all possible types?
  $type: string;
};

type DictionaryTree = {
  [key: string]: DictionaryValue | DictionaryTree;
};

export class Dictionary {
  // TODO: use inferred type from zod schema
  private constructor(public readonly value: DictionaryTree) {
    // TODO: add zod validation
  }

  public static fromFigmaApiResponse(
    // TODO: use inferred type from zod schema
    response: FigmaApiResponse
  ): Dictionary {
    const collections = Object.values(response.meta.variableCollections);
    const variables = Object.values(response.meta.variables);

    const modes = collections.reduce<{ modeId: string; name: string }[]>(
      (accumulator, collection) => {
        const uniqueModes = collection.modes.filter(
          (mode) => !accumulator.some((m) => m.modeId === mode.modeId)
        );

        accumulator.push(...uniqueModes);

        return accumulator;
      },
      []
    );

    // TODO: should we throw an error if we have two different modes with the same name?
    const result = modes.reduce((accumulator, mode) => {
      // TODO: add toKebabCase function
      accumulator[mode.name.toLowerCase()] = variables.reduce(
        (accumulatedVariables, variable) => {
          const path = variable.name
            .replace(/\//g, ".")
            .replace(/ /g, "")
            .toLowerCase();

          const rawValue = variable.valuesByMode[mode.modeId];
          const itIsAnAliasedToken =
            typeof rawValue === "object" &&
            "type" in rawValue &&
            rawValue.type === "VARIABLE_ALIAS";

          if (itIsAnAliasedToken) {
            const path = variable.name
              .replace(/\//g, ".")
              .replace(/ /g, "")
              .toLowerCase();

            const referencedVariable = variables.find(
              (variable) => variable.id === rawValue.id
            );

            const referencedVariableDoesNotExist = !referencedVariable;
            if (referencedVariableDoesNotExist)
              throw new Error(
                `Failed to create dictionary: Referenced variable with id "${rawValue.id}" does not exist`
              );

            set(accumulatedVariables, path, {
              $value: `{${referencedVariable.name
                .replace(/\//g, ".")
                .replace(/ /g, "")
                .toLowerCase()}}`,
              $type: variable.resolvedType.toLowerCase(),
            });

            return accumulatedVariables;
          }

          const itIsAColorValue =
            typeof rawValue === "object" && "r" in rawValue;

          if (itIsAColorValue) {
            // TODO: should we validate that the naming convention is followed? and if yes where? here or in the figmaApi?
            const path = variable.name
              .replace(/\//g, ".")
              .replace(/ /g, "")
              .toLowerCase();

            set(accumulatedVariables, path, {
              $value: Color.fromRGB(
                rawValue.r * 255,
                rawValue.g * 255,
                rawValue.b * 255,
                rawValue.a
              ).toHex(),
              $type: variable.resolvedType.toLowerCase(),
            });

            return accumulatedVariables;
          }

          throw new Error(
            "Failed to create dictionary: Value is not a color value"
          );
        },
        { $type: "mode" }
      );

      return accumulator;
    }, {});

    return new Dictionary(result);
  }
}
