$(document).ready(function() {
	$.getJSON('/analytics/languages?q=merge&q=merged', function(languages) {
		var data = [];
		var colors = [];
		for(var lang in languages) {
			if(languages.hasOwnProperty(lang)) {
				data.push({
					label: lang, 
					value: languages[lang].length
				});
				colors.push('#'+(Math.random().toString(16)).slice(2, 8));
			}
        }
        Morris.Donut({
		    element: 'chart',
		    data: data,
		    colors: colors
		});
	});
});
