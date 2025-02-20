import autoFixAnim from "~/assets/animation/autofix.json";
import { useStable } from "~/hooks/stable";
import { ContentPane } from "~/components/Pane";
import { useDebouncedFunction } from "~/hooks/debounce";
import { CodeEditor } from "~/components/CodeEditor";
import { ActionIcon, Group, Stack, Tooltip } from "@mantine/core";
import { useConfigStore } from '~/stores/config';
import { iconBraces, iconServer, iconStar, iconText } from "~/util/icons";
import { selectionChanged, surqlTableCompletion, surqlVariableCompletion, surqlLinting } from "~/util/editor/extensions";
import { TabQuery } from "~/types";
import { Icon } from "~/components/Icon";
import { showError, tryParseParams } from "~/util/helpers";
import { Text } from "@mantine/core";
import { HtmlPortalNode, OutPortal } from "react-reverse-portal";
import { SelectionRange } from "@codemirror/state";
import { useIntent } from "~/hooks/url";
import { HoverIcon } from "~/components/HoverIcon";
import { formatQuery, validateQuery } from "~/util/surrealql";
import { surrealql } from "codemirror-surrealql";
import { Value } from "surrealql.wasm/v1";
import { encodeCbor } from "surrealdb.js";

const VARIABLE_PATTERN = /\$\w+/gi;
const RESERVED_VARIABLES = new Set([
	'auth',
	'token',
	'scope',
	'session',
	'before',
	'after',
	'value',
	'input',
	'this',
	'parent',
	'event',
]);

export interface QueryPaneProps {
	activeTab: TabQuery;
	showVariables: boolean;
	switchPortal?: HtmlPortalNode<any>;
	selection: SelectionRange | undefined;
	setIsValid: (isValid: boolean) => void;
	setShowVariables: (show: boolean) => void;
	onSaveQuery: () => void;
	onSelectionChange: (value: SelectionRange) => void;
}

export function QueryPane({
	activeTab,
	showVariables,
	setIsValid,
	selection,
	switchPortal,
	setShowVariables,
	onSaveQuery,
	onSelectionChange,
}: QueryPaneProps) {
	const { updateQueryTab } = useConfigStore.getState();

	const setQueryForced = useStable((query: string) => {
		setIsValid(!validateQuery(query));
		updateQueryTab({
			id: activeTab.id,
			query
		});
	});

	const scheduleSetQuery = useDebouncedFunction(setQueryForced, 200);

	const handleFormat = useStable(() => {
		try {
			const query = hasSelection
				? activeTab.query.slice(0, selection.from)
					+ formatQuery(activeTab.query.slice(selection.from, selection.to))
					+ activeTab.query.slice(selection.to)
				: formatQuery(activeTab.query);

			updateQueryTab({
				id : activeTab.id,
				query
			});
		} catch {
			showError({
				title: "Failed to format",
				subtitle: "Your query must be valid to format it"
			});
		}
	});

	const toggleVariables = useStable(() => {
		setShowVariables(!showVariables);
	});

	const inferVariables = useStable(() => {
		if (!activeTab) return;

		const query = activeTab.query;
		const matches = query.match(VARIABLE_PATTERN) || [];

		const currentVars = tryParseParams(activeTab.variables);
		const currentKeys = Object.keys(currentVars);

		const variables = matches
			.map((v) => v.slice(1))
			.filter((v) => !RESERVED_VARIABLES.has(v) && !currentKeys.includes(v));

		const newVars = variables.reduce((acc, v) => {
			acc[v] = "";
			return acc;
		}, {} as Record<string, any>);

		const mergedVars = {
			...currentVars,
			...newVars
		};

		setShowVariables(true);
		updateQueryTab({
			id: activeTab.id,
			variables: Value.from_cbor(new Uint8Array(encodeCbor(mergedVars))).format(true),
		});
	});

	const setSelection = useDebouncedFunction(onSelectionChange, 350);
	const hasSelection = selection?.empty === false;

	useIntent("format-query", handleFormat);
	useIntent("infer-variables", inferVariables);

	return (
		<ContentPane
			title="Query"
			icon={iconServer}
			rightSection={
				switchPortal ? (
					<OutPortal node={switchPortal} />
				) : (
					<Group gap="sm">
						<Tooltip label="Save query">
							<ActionIcon
								onClick={onSaveQuery}
								variant="light"
								aria-label="Save query"
							>
								<Icon path={iconStar} />
							</ActionIcon>
						</Tooltip>

						<Tooltip label={`Format ${hasSelection ? "selecion" : "query"}`}>
							<ActionIcon
								onClick={handleFormat}
								variant="light"
								aria-label={`Format ${hasSelection ? "selecion" : "query"}`}
							>
								<Icon path={iconText} />
							</ActionIcon>
						</Tooltip>

						<Tooltip maw={175} multiline label={
							<Stack gap={4}>
								<Text>Infer variables from query</Text>
								<Text c="dimmed" size="sm">
									Automatically add missing variables.
								</Text>
							</Stack>
						}>
							<HoverIcon
								color="slate"
								onClick={inferVariables}
								animation={autoFixAnim}
							/>
						</Tooltip>

						<Tooltip label={showVariables ? "Hide variables" : "Show variables"}>
							<ActionIcon
								onClick={toggleVariables}
								variant="light"
								aria-label={showVariables ? "Hide variables" : "Show variables"}
							>
								<Icon path={iconBraces} />
							</ActionIcon>
						</Tooltip>
					</Group>
				)
			}
		>
			<CodeEditor
				value={activeTab.query}
				onChange={scheduleSetQuery}
				extensions={[
					surrealql(),
					surqlLinting(),
					surqlTableCompletion(),
					surqlVariableCompletion(),
					selectionChanged(setSelection)
				]}
			/>
		</ContentPane>
	);
}
