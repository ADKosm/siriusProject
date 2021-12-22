import datetime
import os
import uuid
from scipy.stats import beta
import json

from flask import Flask, send_from_directory, jsonify, make_response, request
from pymongo import MongoClient
from pymongo.collection import Collection

app = Flask(__name__, static_url_path="")

total_memes = 7573
memes_pack_size = 10
total_clusters = 100

mongodb_client = MongoClient(os.environ.get("DB", 'localhost'), 27017)
users: Collection = mongodb_client.application.numbers
likes: Collection = mongodb_client.application.likes
memes: Collection = mongodb_client.application.memes

def new_user(user_id):
    result = {"_id": str(user_id), "rec": {}, "vis": {}, "text": {}}
    for i in range(total_clusters):
        result["rec"][str(i)] = {"wins": 0, "loses": 0}
        result["vis"][str(i)] = {"wins": 0, "loses": 0}
        result["text"][str(i)] = {"wins": 0, "loses": 0}
    return result

@app.route("/static/<path:filename>")
def file(filename):
    return send_from_directory("static", filename)

@app.route("/like_meme", methods=["POST"])
def like_meme():
    r_data = request.get_json(force=True)
    user_id = request.cookies.get("user_id")
    meme_id = r_data["meme_id"]
    like = r_data["value"]
    likes.insert_one({"_id": str(uuid.uuid4()), "user_id": user_id, "meme_id": meme_id, "like": like})
    meme = memes.find_one({"_id": meme_id})
    user = users.find_one({"_id": str(user_id)})
    type_ = "loses"
    if like == 1:
        type_ = "wins"
    user["rec"][str(meme["rec"])][type_] += 1
    user["vis"][str(meme["vis"])][type_] += 1
    user["text"][str(meme["text"])][type_] += 1
    users.update_one({"_id": str(user_id)}, {"$set": user})
    return ""

def roll_cluster(probs):
    max_prob_cluster = -1
    max_prob = -1
    for i in range(total_clusters):
        a = probs[str(i)]["wins"]
        b = probs[str(i)]["loses"]
        curr_prob = float(beta.rvs(a + 1, b + 1, 1))
        if(curr_prob > max_prob):
            max_prob = curr_prob
            max_prob_cluster = i
    return max_prob_cluster

def get_meme_recs(user):
    pick_vis = roll_cluster(user["vis"])
    pick_rec = roll_cluster(user["rec"])
    pick_text = roll_cluster(user["text"])
    ret = list(memes.find({"$or": [{"rec": pick_rec}, {"vis": pick_vis}, {"text": pick_text}]}))
    meme_ids = [x["_id"] for x in ret]
    rem = likes.find({"meme_id": {"$in": meme_ids}, "user_id": str(user["_id"])})
    rem_ids = {x["meme_id"] for x in rem}
    ret = [x for x in ret if not (x["_id"] in rem_ids)]
    return ret

@app.route("/meme", methods=["POST"])
def meme_handler():
    user_id = request.cookies.get("user_id")
    if not user_id:
        return ""
    element = users.find_one({"_id": str(user_id)})
    if not element:
        users.insert_one(new_user(user_id))
        element = users.find_one({"_id": str(user_id)})
    ret = get_meme_recs(element)
    for i in range(4):
        if len(ret) >= memes_pack_size:
            break
        ret.extend(get_meme_recs(element))
    ret = ret[:5]
    result = [{"meme_id": x["_id"], "liked": 0} for x in ret]

    return jsonify(result)


@app.route("/")
def index():
    result = make_response((send_from_directory("static", "index.html"), 200))
    user_id = request.cookies.get("user_id")
    if not user_id:
        user_id = str(uuid.uuid4())
        result.set_cookie("user_id", user_id, expires=datetime.datetime.now() + datetime.timedelta(days=365))

    return result

@app.route("/hyu")
def test():
    return "kek"

def merge_dicts(*dict_args):
    result = {}
    for dictionary in dict_args:
        result.update(dictionary)
    return result

def fill_memes_db():
    with open("recsys.json", "r") as f:
        data = json.load(f)
    refined_data = [merge_dicts(x[0], x[1], x[2], x[3]) for x in data]
    for x in refined_data:
        memes.insert_one(x)

if __name__ == '__main__':
    if not memes.find_one({"_id": 1}):
        fill_memes_db()
    app.run(host="0.0.0.0", port=8080)
