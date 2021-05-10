import { isEmpty, isString, cloneDeep, isObject } from "cl-uni/utils";

// 借鉴于作者 magic-zhu

class ClCanvas {
	constructor(canvasId, scope) {
		// 绘图上下文
		this.ctx = null;

		// canvas id
		this.canvasId = canvasId;
		// 当前页面作用域
		this.scope = scope;

		// 渲染队列
		this.renderQuene = [];
		// 图片队列
		this.imageQueue = [];

		// 创建画布
		this.create();
	}

	// 创建画布
	create() {
		this.ctx = uni.createCanvasContext(this.canvasId, this.scope);
		return this;
	}

	// 块
	div(options) {
		let render = () => {
			this.divRender(options);
		};
		this.renderQuene.push(render);
		return this;
	}

	// 文本
	text(options) {
		let render = () => {
			this.textRender(options);
		};
		this.renderQuene.push(render);
		return this;
	}

	// 图片
	image(options) {
		let render = () => {
			this.imageRender(options);
		};
		this.imageQueue.push(options);
		this.renderQuene.push(render);
		return this;
	}

	// 绘画
	draw(save = false) {
		return new Promise(resolve => {
			let next = () => {
				this.render();
				this.ctx.draw(save, () => {
					resolve();
				});
			};

			if (!isEmpty(this.imageQueue)) {
				this.preLoadImage().then(next);
			} else {
				next();
			}
		});
	}

	// 生成图片
	createImage(options) {
		return new Promise(resolve => {
			let data = {
				canvasId: this.canvasId,
				...options,
				success: res => {
					// #ifdef MP-ALIPAY
					resolve(res.apFilePath);
					// #endif

					// #ifndef MP-ALIPAY
					resolve(res.tempFilePath);
					// #endif
				},
				fail: err => {
					reject(err);
				}
			};

			// #ifdef MP-ALIPAY
			this.ctx.toTempFilePath(data);
			// #endif

			// #ifndef MP-ALIPAY
			uni.canvasToTempFilePath(data, this.scope);
			// #endif
		});
	}

	// 保存图片
	saveImage(options) {
		uni.showLoading({
			title: "图片下载中..."
		});
		this.createImage(options).then(path => {
			return new Promise(resolve => {
				uni.hideLoading();
				uni.saveImageToPhotosAlbum({
					filePath: path,
					success: () => {
						uni.showToast({
							title: "保存图片成功"
						});
						resolve();
					},
					fail: err => {
						// #ifdef MP-ALIPAY
						uni.showToast({
							title: "保存图片成功"
						});
						// #endif

						// #ifndef MP-ALIPAY
						uni.showToast({
							title: "保存图片失败",
							icon: "none"
						});
						// #endif
					}
				});
			});
		});
	}

	// 预览图片
	previewImage(options) {
		this.createImage(options).then(url => {
			uni.previewImage({
				urls: [url]
			});
		});
	}

	// 下载图片
	downLoadImage(item) {
		return new Promise((resolve, reject) => {
			if (!item.url) {
				return reject("url 不能为空");
			}

			// 处理base64
			if (item.url.indexOf("data:image") >= 0) {
				return resolve(item.url);
			}

			uni.getImageInfo({
				src: item.url,
				success: result => {
					item.sheight = result.height;
					item.swidth = result.width;
					resolve(result.path);
				},
				fail: err => {
					console.log(err);
					reject(err);
				}
			});
		});
	}

	// 预加载图片
	async preLoadImage() {
		await Promise.all(this.imageQueue.map(this.downLoadImage));
	}

	// 设置背景颜色
	setBackground(options) {
		if (!options) return null;

		let backgroundColor;

		if (!isString(options)) {
			backgroundColor = options;
		}

		if (isString(options.backgroundColor)) {
			backgroundColor = options.backgroundColor;
		}

		if (isObject(options.backgroundColor)) {
			let { startX, startY, endX, endY, gradient } = options.backgroundColor;
			const rgb = this.ctx.createLinearGradient(startX, startY, endX, endY);
			for (let i = 0, l = gradient.length; i < l; i++) {
				rgb.addColorStop(gradient[i].step, gradient[i].color);
			}
			backgroundColor = rgb;
		}

		this.ctx.setFillStyle(backgroundColor);

		return this;
	}

	// 设置边框
	setBorder(options) {
		if (!options.border) return this;

		let { x, y, width: w, height: h, border, radius: r } = options;

		if (border.width) {
			this.ctx.setLineWidth(border.width);
		}

		if (border.color) {
			this.ctx.setStrokeStyle(border.color);
		}

		// 偏移距离
		let p = border.width / 2;

		// 是否有圆角
		if (r) {
			this.drawRadiusRoute(x - p, y - p, w + 2 * p, h + 2 * p, r + p);
			this.ctx.stroke();
		} else {
			this.ctx.strokeRect(x - p, y - p, w + 2 * p, h + 2 * p);
		}

		return this;
	}

	// 设置缩放，旋转
	setTransform(options) {
		if (options.scale) {
		}
		if (options.rotate) {
		}
	}

	// 带有圆角的路径绘制
	drawRadiusRoute(x, y, w, h, r) {
		this.ctx.beginPath();
		this.ctx.moveTo(x + r, y, y);
		this.ctx.lineTo(x + w - r, y);
		this.ctx.arc(x + w - r, y + r, r, 1.5 * Math.PI, 0);
		this.ctx.lineTo(x + w, y + h - r);
		this.ctx.arc(x + w - r, y + h - r, r, 0, 0.5 * Math.PI);
		this.ctx.lineTo(x + r, y + h);
		this.ctx.arc(x + r, y + h - r, r, 0.5 * Math.PI, Math.PI);
		this.ctx.lineTo(x, y + r);
		this.ctx.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
		this.ctx.closePath();
	}

	// 裁剪图片
	cropImage(mode, width, height, sWidth, sHeight, x, y) {
		let cx, cy, cw, ch, sx, sy, sw, sh;
		switch (mode) {
			case "aspectFill":
				if (width <= height) {
					let p = width / sWidth;
					cw = width;
					ch = sHeight * p;
					cx = 0;
					cy = (height - ch) / 2;
				} else {
					let p = height / sHeight;
					cw = sWidth * p;
					ch = height;
					cx = (width - cw) / 2;
					cy = 0;
				}
				break;
			case "aspectFit":
				if (width <= height) {
					let p = height / sHeight;
					sw = width / p;
					sh = sHeight;
					sx = x + (sWidth - sw) / 2;
					sy = y;
				} else {
					let p = width / sWidth;
					sw = sWidth;
					sh = height / p;
					sx = x;
					sy = y + (sHeight - sh) / 2;
				}
				break;
		}
		return { cx, cy, cw, ch, sx, sy, sw, sh };
	}

	// 获取文本内容
	getTextRows({ text, fontSize = 14, width = 100, lineClamp = 1, overflow, letterSpace = 0 }) {
		let arr = [[]];
		let a = 0;

		for (let i = 0; i < text.length; i++) {
			let b = this.getFontPx(text[i], { fontSize, letterSpace });

			if (a + b > width) {
				a = b;
				arr.push(text[i]);
			} else {
				// 最后一行且设置超出省略号
				if (
					overflow == "ellipsis" &&
					arr.length == lineClamp &&
					a + 3 * this.getFontPx(".", { fontSize, letterSpace }) > width - 5
				) {
					arr[arr.length - 1] += "...";
					break;
				} else {
					a += b;
					arr[arr.length - 1] += text[i];
				}
			}
		}

		return arr;
	}

	// 获取单个字体像素大小
	getFontPx(text, { fontSize = 14, letterSpace }) {
		if (!text) {
			return fontSize / 2 + fontSize / 14 + letterSpace;
		}

		let ch = text.charCodeAt();

		if ((ch >= 0x0001 && ch <= 0x007e) || (0xff60 <= ch && ch <= 0xff9f)) {
			return fontSize / 2 + fontSize / 14 + letterSpace;
		} else {
			return fontSize + letterSpace;
		}
	}

	// 渲染块
	divRender(options) {
		this.ctx.save();
		this.setBackground(options);
		this.setBorder(options);
		this.setTransform(options);

		// 区分是否有圆角采用不同模式渲染
		if (options.radius) {
			let { x, y } = options;
			let w = options.width;
			let h = options.height;
			let r = options.radius;
			// 画路径
			this.drawRadiusRoute(x, y, w, h, r);
			// 填充
			this.ctx.fill();
		} else {
			this.ctx.fillRect(options.x, options.y, options.width, options.height);
		}
		this.ctx.restore();
	}

	// 渲染文本
	textRender(options) {
		let { fontSize = 14, color = "#000000", x, y, letterSpace, lineHeight = 14 } =
			options || {};

		this.ctx.save();

		// 设置字体大小
		this.ctx.setFontSize(fontSize);

		// 设置字体颜色
		this.ctx.setFillStyle(color);

		// 获取文本内容
		let rows = this.getTextRows(options);

		// 获取文本行高
		let lh = lineHeight - fontSize;

		// 逐行写入
		for (let i = 0; i < rows.length; i++) {
			let d = 0;
			if (letterSpace) {
				for (let j = 0; j < rows[i].length; j++) {
					// 写入文字
					this.ctx.fillText(rows[i][j], x + d, (i + 1) * fontSize + y + lh * i);

					// 设置偏移
					d += this.getFontPx(rows[i][j], options);
				}
			} else {
				// 写入文字
				this.ctx.fillText(rows[i], x, (i + 1) * fontSize + y + lh * i);
			}
		}

		this.ctx.restore();
	}

	// 渲染图片
	imageRender(options) {
		this.ctx.save();

		if (options.radius) {
			// 画路径
			this.drawRadiusRoute(
				options.x,
				options.y,
				options.width || options.swidth,
				options.height || options.sHeight,
				options.radius
			);
			// 填充
			this.ctx.fill();
			// 裁剪
			this.ctx.clip();
		}
		let temp = cloneDeep(this.imageQueue[0]);

		if (options.mode) {
			let { cx, cy, cw, ch, sx, sy, sw, sh } = this.cropImage(
				options.mode,
				temp.swidth,
				temp.sheight,
				temp.width,
				temp.height,
				temp.x,
				temp.y
			);
			switch (options.mode) {
				case "aspectFit":
					this.ctx.drawImage(temp.url, sx, sy, sw, sh);
					break;
				case "aspectFill":
					this.ctx.drawImage(
						temp.url,
						cx,
						cy,
						cw,
						ch,
						temp.x,
						temp.y,
						temp.width,
						temp.height
					);
					break;
			}
		} else {
			this.ctx.drawImage(
				temp.url,
				temp.x,
				temp.y,
				temp.width || temp.swidth,
				temp.height || temp.sheight
			);
		}
		this.imageQueue.shift();
		this.ctx.restore();
	}

	// 渲染全部
	render() {
		this.renderQuene.forEach(ele => {
			ele();
		});
	}
}

export default ClCanvas;
