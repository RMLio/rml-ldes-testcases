module.exports = function (eleventyConfig) {

	// Copy `img/` to `_site/img`
	eleventyConfig.addPassthroughCopy("img");

	return {
		templateFormats: ["html", "css"],
	};
};
