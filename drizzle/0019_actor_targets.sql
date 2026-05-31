UPDATE `event_schema_versions`
SET `definition` = json_set(
	`definition`,
	'$.events',
	(
		SELECT json_group_array(json(event_json))
		FROM (
			SELECT
				CASE
					WHEN json_type(event.value, '$.aggregations') = 'array' THEN json_set(
						event.value,
						'$.aggregations',
						(
							SELECT json_group_array(json(aggregation_json))
							FROM (
								SELECT
									CASE
										WHEN json_type(aggregation.value, '$.target') IS NULL THEN json_set(
											aggregation.value,
											'$.target',
											'actor'
										)
										ELSE aggregation.value
									END AS aggregation_json
								FROM json_each(event.value, '$.aggregations') aggregation
								ORDER BY aggregation.key
							)
						)
					)
					ELSE event.value
				END AS event_json
			FROM json_each(`definition`, '$.events') event
			ORDER BY event.key
		)
	)
)
WHERE EXISTS (
	SELECT 1
	FROM json_each(`definition`, '$.events') event
	INNER JOIN json_each(event.value, '$.aggregations') aggregation
	WHERE json_type(aggregation.value, '$.target') IS NULL
);
